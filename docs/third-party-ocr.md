# Компоненты локального OCR

- [Tesseract4Android 4.9.0](https://github.com/adaptech-cz/Tesseract4Android/tree/4.9.0) — Apache-2.0; JNI-обёртка и включённые нативные библиотеки. Перечень зависимостей и их лицензий указан в README и исходниках проекта.
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) — Apache-2.0.
- [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd) — Apache-2.0, языковые данные rus/eng. Модели закреплены хешами в `tools/prepare_ocr_models.py` и `assets/ocr-models.json`.
- [AndroidX ExifInterface](https://developer.android.com/jetpack/androidx/releases/exifinterface) — Apache-2.0.
- Android PdfRenderer — часть Android SDK, отдельная библиотека распознавания PDF не нужна.

Лицензионные тексты для движка и моделей добавлены в `app/src/main/assets/ocr-licenses/`. Эти уведомления следует сохранять в распространяемой сборке; лицензии нативных зависимостей Tesseract4Android также включены в этот каталог.
