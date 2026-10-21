import base64
import hashlib
import hmac
import json
import io
import os
import threading
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from .ocr import pages, recognize
from .parser import extract

app = FastAPI(title='AutoHub local OCR', docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get('OCR_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000').split(','),
                   allow_methods=['POST', 'GET'], allow_headers=['Authorization', 'Content-Type'])
lock = threading.Lock()  # PDFium is not thread-safe. One document at a time per process.
MAX_BODY = 24 * 1024 * 1024


def process(files):
    lines, hashes, previews, page_count, byte_count = [], [], [], 0, 0
    for file in files:
        data = base64.b64decode(file['data'], validate=True)
        byte_count += len(data)
        if not data or byte_count > 16 * 1024 * 1024:
            raise ValueError('Общий размер файлов должен быть от 1 байта до 16 МБ.')
        hashes.append(hashlib.sha256(data).hexdigest())
        for image in pages(data):
            page_count += 1
            if page_count > 10: raise ValueError('Не больше 10 страниц за одно распознавание.')
            try:
                preview = image.copy()
                preview.thumbnail((1400, 1400))
                out = io.BytesIO(); preview.save(out, format='JPEG', quality=70); preview.close()
                previews.append('data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode())
                lines.extend(recognize(image, page_count))
            finally: image.close()
    if not lines: raise ValueError('Текст не найден. Попробуйте более чёткий снимок без бликов.')
    result = extract(lines)
    result.update({'previews': previews, 'pages': page_count, 'fileHashes': hashes, 'engine': 'tesseract-rus-eng',
                   'documentHash': hashlib.sha256('|'.join(sorted(hashes)).encode()).hexdigest()})
    return result


@app.get('/health')
def health():
    return {'status': 'ok', 'engine': 'tesseract', 'llm': False}


@app.post('/v1/documents/recognize')
async def recognize_document(request: Request):
    token = os.environ.get('OCR_API_TOKEN', '')
    if len(token) < 24:
        raise HTTPException(503, 'На сервере не настроен OCR_API_TOKEN (минимум 24 символа).')
    if not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
        raise HTTPException(401, 'Неверный ключ доступа к OCR.')
    if not lock.acquire(blocking=False): raise HTTPException(429, 'OCR занят. Повторите через минуту.')
    try:
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_BODY: raise HTTPException(413, 'Слишком большой запрос.')
            body.extend(chunk)
        payload = json.loads(body)
        files = payload.get('files') if isinstance(payload, dict) else None
        if not isinstance(files, list) or not 1 <= len(files) <= 10:
            raise ValueError('Выберите от 1 до 10 файлов.')
        if any(not isinstance(f, dict) or not isinstance(f.get('data'), str) for f in files):
            raise ValueError('Некорректный формат файлов.')
        return await run_in_threadpool(process, files)
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, 'Не удалось прочитать документ. Проверьте формат (JPG/PNG/WEBP/PDF), размер до 16 МБ и до 10 страниц.')
    except Exception:
        # No document text, file names, tokens, or traces in HTTP errors.
        raise HTTPException(422, 'Не удалось распознать документ: файл повреждён, защищён паролем, нечитаем или OCR недоступен.')
    finally:
        lock.release()
