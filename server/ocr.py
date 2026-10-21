"""Local OCR only. No outgoing requests, LLM or paid APIs."""
import csv
import io
import math
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageOps
import pypdfium2 as pdfium

Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_PAGES = 10


def pages(data):
    if data.startswith(b'%PDF-'):
        with pdfium.PdfDocument(data) as doc:
            if not 0 < len(doc) <= MAX_PAGES:
                raise ValueError('PDF должен содержать от 1 до 10 страниц.')
            for i in range(len(doc)):
                page = doc[i]
                try:
                    w, h = page.get_size()
                    if w <= 0 or h <= 0 or max(w, h) > 14400:
                        raise ValueError('Недопустимый размер страницы PDF.')
                    scale = min(300 / 72, math.sqrt(12_000_000 / (w * h)))
                    bitmap = page.render(scale=scale)
                    try: yield bitmap.to_pil().convert('RGB')
                    finally: bitmap.close()
                finally: page.close()
    else:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in ('JPEG', 'PNG', 'WEBP'):
                raise ValueError('Поддерживаются JPG, PNG, WEBP и PDF.')
            if getattr(source, 'n_frames', 1) != 1:
                raise ValueError('Многостраничные изображения загрузите как PDF.')
            if source.width * source.height > 25_000_000:
                raise ValueError('Изображение больше 25 мегапикселей.')
            image = ImageOps.exif_transpose(source).convert('RGBA')
            background = Image.new('RGBA', image.size, 'white')
            background.alpha_composite(image)
            yield background.convert('RGB')


def recognize(image, page_number):
    image.thumbnail((4200, 4200))
    if min(image.size) < 300:
        raise ValueError('Слишком маленькое изображение. Загрузите полный снимок документа.')
    image = ImageOps.autocontrast(ImageOps.grayscale(image))
    with tempfile.TemporaryDirectory(prefix='autohub-ocr-') as folder:
        path = Path(folder) / 'page.png'
        image.save(path)
        # OSD is best effort: sparse pages often contain too little text for rotation detection.
        try:
            osd = subprocess.run(['tesseract', str(path), 'stdout', '--psm', '0'],
                                 capture_output=True, text=True, timeout=15)
            import re
            angle = re.search(r'Rotate: (90|180|270)', osd.stdout)
            if angle:
                image = image.rotate(-int(angle[1]), expand=True); image.save(path)
        except subprocess.TimeoutExpired:
            pass
        proc = subprocess.run(['tesseract', str(path), 'stdout', '-l', 'rus+eng', '--psm', '6', 'tsv'],
                              capture_output=True, text=True, timeout=60)
        if proc.returncode:
            raise RuntimeError('OCR недоступен. Проверьте установку Tesseract и языков rus+eng.')
        groups = {}
        for row in csv.DictReader(io.StringIO(proc.stdout), delimiter='\t', quoting=csv.QUOTE_NONE):
            if row.get('level') != '5' or not row.get('text', '').strip(): continue
            key = (row['block_num'], row['par_num'], row['line_num'])
            groups.setdefault(key, []).append(row)
        lines = []
        for words in groups.values():
            x = min(int(w['left']) for w in words); y = min(int(w['top']) for w in words)
            right = max(int(w['left']) + int(w['width']) for w in words)
            bottom = max(int(w['top']) + int(w['height']) for w in words)
            lines.append({'page': page_number, 'text': ' '.join(w['text'] for w in words),
                          'confidence': round(sum(float(w['conf']) for w in words) / len(words), 1),
                          'box': [x, y, right, bottom], 'imageSize': list(image.size)})
        return lines
