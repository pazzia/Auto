#!/usr/bin/env node
/*
 * Прогон документа тем же конвейером, что в APK, но на ПК:
 *   проходы — из OfflineOcrEngine.kt (разбирается исходник, чтобы не разойтись),
 *   предобработка — OcrPreprocess.java (тот же класс, что в APK),
 *   OCR — Tesseract 5.5.1 из Tesseract4Android 4.9.0 (tools/ocr_replay/build.sh) с моделями из assets APK,
 *   разбор — document-parser.js (по умолчанию из APK, --parser путь), вызов как в web/documents.js.
 * node tools/ocr_replay/replay.cjs <фото> --apk-assets <каталог assets из APK> [--parser file] [--raw] [--passes 2400:true:4,...]
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2); const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const image = args[0]; const assets = opt('--apk-assets'); const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-replay-'));
const BIN = opt('--bin') || path.join(__dirname, 'build');
if (!image || !assets) { console.error('usage: replay.cjs <image> --apk-assets <dir> [--parser file] [--raw]'); process.exit(2); }
const parserFile = opt('--parser') || path.join(assets, 'www', 'document-parser.js');

const kt = fs.readFileSync(path.join(ROOT, 'app/src/main/java/ru/autohub/app/OfflineOcrEngine.kt'), 'utf8');
const PSM = { PSM_SINGLE_COLUMN: 4, PSM_SINGLE_BLOCK: 6, PSM_AUTO: 3, PSM_SPARSE_TEXT: 11, PSM_SINGLE_BLOCK_VERT_TEXT: 5, PSM_AUTO_OSD: 1 };
const passes = [...kt.matchAll(/Pass\((\d+), (true|false), (true|false), TessBaseAPI\.PageSegMode\.(\w+)\)/g)].map(m => ({ longSide: +m[1], lines: m[2] === 'true', binarize: m[3] === 'true', psm: PSM[m[4]],
  name: m[1] === '0' ? 'original-psm' + PSM[m[4]] : (m[3] === 'true' ? 'bw' : 'gray') + '-' + m[1] + '-psm' + PSM[m[4]] }));
if (opt('--passes')) passes.splice(0, passes.length, ...opt('--passes').split(',').map(x => { const [l, r, m, b] = x.split(':'); return { longSide: +l, lines: r === 'true', psm: +m, binarize: b !== 'false', name: 'exp-' + x }; }));
if (!passes.length) throw new Error('Не найдены проходы в OfflineOcrEngine.kt');

const classes = path.join(work, 'classes');
cp.execFileSync('javac', ['-encoding', 'UTF-8', '-d', classes, path.join(ROOT, 'app/src/main/java/ru/autohub/app/OcrPreprocess.java'), path.join(__dirname, 'Prepare.java')], { stdio: 'inherit' });
const size = cp.execFileSync('java', ['-cp', classes, 'Prepare', image, work, ...passes.map(p => p.longSide + ':' + p.lines + ':' + (p.binarize !== false))], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\s+/).map(Number);

const dataDir = path.join(work, 'data'); fs.mkdirSync(path.join(dataDir, 'tessdata'), { recursive: true });
for (const l of ['rus', 'eng']) fs.copyFileSync(path.join(assets, 'tessdata', l + '.traineddata'), path.join(dataDir, 'tessdata', l + '.traineddata'));
const out = cp.execFileSync(path.join(BIN, 'replay'), [path.join(dataDir, 'tessdata'), '0', ...passes.flatMap((p, i) => [path.join(work, 'pass-' + i + '.argb'), String(p.psm)])],
  { env: { ...process.env, LD_LIBRARY_PATH: path.join(BIN, 'lib') }, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString().trim().split('\n').map(JSON.parse);

// TessBaseAPI.init(datapath) передаёт в нативный Init путь datapath + "tessdata"
// Как в OfflineOcrEngine.process: строки каждого прохода с confidence страницы и размером исходника
const result = { passes: out.map((r, i) => ({ name: passes[i].name, confidence: r.confidence,
  lines: r.text.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ page: 1, text, confidence: r.confidence, box: null, imageSize: size })) })) };
result.lines = result.passes[0].lines;
// Как в web/documents.js
global.window = {}; const parser = require(path.resolve(parserFile));
const parsed = parser.extractBest(result.passes && result.passes.length ? result.passes : [result.lines]);
const sha = require('crypto').createHash('sha256').update(fs.readFileSync(parserFile)).digest('hex');
const report = { image: path.basename(image), sourceSize: size, parser: parserFile, parserSha256: sha, passes: result.passes.map(p => ({ name: p.name, confidence: p.confidence, lines: p.lines.length })),
  fields: Object.fromEntries(Object.entries(parsed.fields).map(([k, v]) => [k, v.value])),
  items: parsed.items.map(i => ({ kind: i.kind, name: i.name, quantity: i.quantity, price: i.price, total: i.total })), warnings: parsed.warnings };
if (args.includes('--raw')) report.text = result.passes.map(p => '=== ' + p.name + '\n' + p.lines.map(l => l.text).join('\n'));
console.log(JSON.stringify(report, null, 1));
fs.rmSync(work, { recursive: true, force: true });
