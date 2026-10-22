#!/usr/bin/env node
/*
 * Сверка отчёта приёмки (ocr-acceptance.json с эмулятора или JSON replay.cjs) с эталоном.
 * node tools/ocr_replay/compare.cjs <отчёт.json> <эталон.json> [--required имя1,имя2]
 * Эталон: { fields: {...}, lines: [{section, name, qty, price, sum}], must_not_appear_as_lines: [...] }.
 * Код выхода 1 — если не совпал хотя бы один документ из --required (по умолчанию все).
 */
const fs = require('fs');
const [reportFile, goldenFile] = process.argv.slice(2);
const reqArg = process.argv.indexOf('--required'); const required = reqArg > 0 ? process.argv[reqArg + 1].split(',') : null;
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); const g = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
const docs = report.documents || [report];
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
let failed = 0;
for (const d of docs) {
  const errs = [], notes = [];
  if (d.error) errs.push('ошибка: ' + d.error);
  const f = d.fields || {};
  for (const k in g.fields) if (String(f[k]) !== String(g.fields[k])) errs.push(`${k}: ожидалось ${g.fields[k]}, получено ${f[k]}`);
  const items = d.items || [];
  if (items.length !== g.lines.length) errs.push(`строк: ожидалось ${g.lines.length}, получено ${items.length}`);
  g.lines.forEach((l, i) => { const it = items[i]; if (!it) return;
    for (const [a, b] of [['section', 'kind'], ['qty', 'quantity'], ['price', 'price'], ['sum', 'total']]) if (String(l[a]) !== String(it[b])) errs.push(`строка ${i + 1} ${a}: ожидалось ${l[a]}, получено ${it[b]}`);
    const dist = lev(l.name.toLowerCase(), String(it.name).toLowerCase());
    if (dist / l.name.length > 0.2) errs.push(`строка ${i + 1} название: «${it.name}» вместо «${l.name}»`); else if (dist) notes.push(`строка ${i + 1}: «${it.name}» (${dist} опеч.)`); });
  (g.must_not_appear_as_lines || []).forEach(n => { if (items.some(it => lev(n.slice(0, 15).toLowerCase(), String(it.name).slice(0, 15).toLowerCase()) <= 3)) errs.push('в строки попала рекомендация: ' + n); });
  const name = d.image || '?'; const must = !required || required.includes(name);
  if (errs.length && must) failed++;
  console.log(`${errs.length ? '✗' : '✓'} ${name}${must ? '' : ' (для отчёта)'}${d.ocrMs ? ' · ' + Math.round(d.ocrMs / 1000) + ' с' : ''}`);
  errs.forEach(e => console.log('    ' + e)); notes.forEach(n => console.log('    · ' + n));
}
if (report.parserSha256) console.log('document-parser.js sha256: ' + report.parserSha256 + (report.build ? ' · сборка ' + report.build : ''));
process.exit(failed ? 1 : 0);
