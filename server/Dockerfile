FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server /app/server
RUN useradd --uid 10001 --create-home ocr
USER ocr
ENV OMP_THREAD_LIMIT=2
EXPOSE 8080
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
