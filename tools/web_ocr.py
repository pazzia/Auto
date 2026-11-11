"""Веб-версия: движок распознавания документов для браузера (web/ocr-web.js).

    python3 tools/web_ocr.py <папка сайта>

Кладёт в <сайт>/<OCR_DIR>:
  tesseract.min.js, worker.min.js        — tesseract.js (из npm, версия и хеш — tools/web-ocr/package-lock.json)
  core/tesseract-core-*-lstm.wasm.js     — движок Tesseract в WebAssembly (браузер выбирает вариант под процессор)
  lang/rus.traineddata, eng.traineddata  — те же модели tessdata_fast, что в APK (tools/prepare_ocr_models.py, SHA-256)
  pdf/pdf.min.mjs, pdf.worker.min.mjs    — pdf.js (сборка legacy — для браузеров постарше)
  licenses/                              — лицензии (Apache-2.0)
Папка названа по версиям, поэтому её можно кэшировать навсегда: новая версия — новая папка.
В APK это не попадает: там распознаёт Tesseract4Android.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'tools' / 'web-ocr'
sys.path.insert(0, str(ROOT / 'tools'))
import prepare_ocr_models  # noqa: E402

PINNED = json.loads((PKG / 'package.json').read_text(encoding='utf-8'))['dependencies']


def ocr_dir():
    """Папка движка внутри сайта, например ocr/t7.0.0-p5.4.394-m8741641/ (со слешем в конце)."""
    return 'ocr/t%s-p%s-m%s/' % (PINNED['tesseract.js-core'], PINNED['pdfjs-dist'], prepare_ocr_models.REVISION[:7])


def install():
    mods = PKG / 'node_modules'
    ok = all((mods / name / 'package.json').exists() and json.loads((mods / name / 'package.json').read_text())['version'] == ver
             for name, ver in PINNED.items())
    if not ok:
        # npm ci ставит ровно то, что в package-lock.json, и сверяет хеши (integrity); скрипты пакетов не запускаются
        subprocess.run(['npm', 'ci', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund'], cwd=PKG, check=True)
    for name, ver in PINNED.items():
        got = json.loads((mods / name / 'package.json').read_text())['version']
        if got != ver:
            raise SystemExit('web-ocr: %s %s, ожидалась %s' % (name, got, ver))
    return mods


def vendor(site):
    site = Path(site)
    if not (site / 'index.html').exists():
        raise SystemExit('web-ocr: в %s нет index.html — сначала tools/build_prototype.py' % site)
    mods = install()
    out = site / ocr_dir()
    if out.exists():
        shutil.rmtree(out)
    for sub in ('core', 'lang', 'pdf', 'licenses'):
        (out / sub).mkdir(parents=True, exist_ok=True)
    tj, core, pdf = mods / 'tesseract.js', mods / 'tesseract.js-core', mods / 'pdfjs-dist'
    shutil.copy(tj / 'dist' / 'tesseract.min.js', out / 'tesseract.min.js')
    shutil.copy(tj / 'dist' / 'worker.min.js', out / 'worker.min.js')
    for variant in ('lstm', 'simd-lstm', 'relaxedsimd-lstm'):
        shutil.copy(core / ('tesseract-core-%s.wasm.js' % variant), out / 'core' / ('tesseract-core-%s.wasm.js' % variant))
    prepare_ocr_models.fetch(out / 'lang')
    shutil.copy(pdf / 'legacy' / 'build' / 'pdf.min.mjs', out / 'pdf' / 'pdf.min.mjs')
    shutil.copy(pdf / 'legacy' / 'build' / 'pdf.worker.min.mjs', out / 'pdf' / 'pdf.worker.min.mjs')
    shutil.copy(tj / 'LICENSE.md' if (tj / 'LICENSE.md').exists() else tj / 'LICENSE', out / 'licenses' / 'tesseract.js-LICENSE.txt')
    shutil.copy(core / 'LICENSE', out / 'licenses' / 'tesseract.js-core-LICENSE.txt')
    shutil.copy(pdf / 'LICENSE', out / 'licenses' / 'pdf.js-LICENSE.txt')
    lic = ROOT / 'app' / 'src' / 'main' / 'assets' / 'ocr-licenses'
    for name in ('Tesseract-LICENSE.txt', 'tessdata_fast-LICENSE.txt', 'Leptonica-LICENSE.txt'):
        shutil.copy(lic / name, out / 'licenses' / name)
    size = sum(f.stat().st_size for f in out.rglob('*') if f.is_file())
    print('web-ocr: %s — %.1f МБ' % (out.relative_to(site), size / 1e6))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    vendor(sys.argv[1])
