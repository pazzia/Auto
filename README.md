# АвтоХаб

Мобильное приложение для автовладельцев в России: гараж и история обслуживания, сравнение запчастей из магазинов,
автосервисы с онлайн-записью, данные об авто по госномеру и VIN.

Сейчас это **кликабельный прототип 0.4**: 25 экранов, все данные — из заглушек API (демонстрационные).

- Веб-версия: https://pazzia.github.io/Auto/ (после первого деплоя, см. ниже)
- APK: вкладка **Actions** → последний запуск «Build APK» → артефакт `autohub-debug-apk`
- Контекст проекта и дорожная карта: [`docs/`](docs)

## Структура

| Путь | Что это |
| --- | --- |
| `app/` | Android-оболочка (Kotlin + WebView). Прототип лежит в `app/src/main/assets/www/` — это собранный результат, руками не править |
| `web/` | Исходники логики прототипа: `api.js` (слой API и заглушки), `car.js` (добавление авто), `services.js` (сервисы и карта), `addcar.html`, `app.js`, `app.css`, `map/podmoskovye.svg` |
| `design/` | Исходники 25 экранов из Claude Design (`*.dc.html`) и раскладка холста |
| `tools/` | `build_prototype.py` — сборка прототипа, `make_map.py` — генерация карты Подмосковья |
| `docs/` | Контекст, дорожная карта, инструкция проекта, описание API ([`docs/api.md`](docs/api.md)) |
| `.github/workflows/` | Сборка APK и публикация веб-версии на GitHub Pages |

## Как вносить изменения

```bash
# после правок в web/ или design/
python3 tools/build_prototype.py
# после правок координат карты
python3 tools/make_map.py && python3 tools/build_prototype.py

git add -A && git commit -m "…" && git push
```

После `git push` в `main` Actions сами пересоберут прототип, APK и веб-версию.
Локально: откройте `app/src/main/assets/www/index.html` в браузере или запустите
`python3 -m http.server -d app/src/main/assets/www 8000` и зайдите на http://localhost:8000.

## Первый деплой

1. Залейте репозиторий (`git push -u origin main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** (один раз).
3. **Actions** → «Deploy web prototype» → Re-run, если первый запуск упал до включения Pages.
4. Для релиза с APK: `git tag v0.4.0 && git push --tags` — APK приложится к релизу.

## Режимы данных

По умолчанию всё работает на заглушках. `?api=live` в адресе включает реальные источники:
VIN и модели — открытая база NHTSA vPIC, остальное — бэкенд (пока не подключён). Подробно — [`docs/api.md`](docs/api.md).

Демо-данные для проверки: госномер **А123ВС 177**, VIN **XWEFC41ABKC001234**.

## Сборка APK локально

Android Studio → File → Open → корень репозитория → Build → Build APK(s).
Если Studio предложит создать Gradle Wrapper — согласитесь.
