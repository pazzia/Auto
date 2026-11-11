"""Prepare bundled OCR models at build time. Never runs on the phone."""
import hashlib
import json
import os
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets'
REVISION = '87416418657359cb625c412a48b6e1d6d41c29bd'
HASHES = {
    'rus': 'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225',
    'eng': '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
}

def main():
    fetch(ASSETS / 'tessdata')
    (ASSETS / 'ocr-models.json').write_text(json.dumps(dict(revision=REVISION, **HASHES), indent=2) + '\n')
    print('Verified bundled OCR models: rus + eng')

def fetch(folder):
    """Скачать модели в folder (или оставить уже скачанные) и проверить SHA-256. Нужен и APK, и веб-версии (tools/web_ocr.py)."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for language, expected in HASHES.items():
        dest = folder / (language + '.traineddata')
        if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == expected:
            continue
        url = f'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/{REVISION}/{language}.traineddata'
        with urlopen(url, timeout=90) as response:
            data = response.read(20 * 1024 * 1024)
        if hashlib.sha256(data).hexdigest() != expected:
            raise RuntimeError('OCR model checksum mismatch: ' + language)
        temp = dest.with_suffix('.tmp')
        temp.write_bytes(data)
        os.replace(temp, dest)

if __name__ == '__main__':
    main()
