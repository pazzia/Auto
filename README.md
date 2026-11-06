# АвтоХаб

Мобильное приложение для автовладельцев в России: гараж и история обслуживания, сравнение запчастей из магазинов,
автосервисы с онлайн-записью, данные об авто по госномеру и VIN.

Сейчас это **кликабельный прототип, сборка 0.17** (номер — в файле `VERSION`): 37 экранов (19 из макетов Claude Design и 18 свёрстанных вручную), данные — из заглушек API (демонстрационные) и с самого телефона.

[Импорт наряд-заказов без LLM](docs/ocr.md): распознавание работает прямо на Android без сервера и интернета, модели rus и eng включены в APK. Проверка на телефоне владельца — AUTO-42.

- APK: раздел **Releases** → «АвтоХаб <номер>» → `AutoHub-<номер>.apk` (или Actions → артефакт `AutoHub-<номер>`)
- Веб-версия: отдельного деплоя нет; соберите прототип и откройте локально (см. ниже)
- Контекст проекта и дорожная карта: [`docs/`](docs)

## Структура

| Путь | Что это |
| --- | --- |
| `app/` | Android-оболочка (Kotlin + WebView). Прототип лежит в `app/src/main/assets/www/` — это собранный результат, руками не править |
| `web/` | Исходники логики прототипа: `ui.js` (шторки, диалоги), `api.js` (слой API и заглушки), `car.js` (гараж и добавление авто), `services.js` (сервисы и карта), `cart.js` + `cart.html` (корзина), `parts.js` (поиск, цены, сравнение), `screens.js` (остальные экраны), `auth.js` + `welcome.html` + `profile.html` (вход и кабинет), `to.js` (сценарий ТО), `icons.js`, `parking.js`, `mechanic.js`, `device.js` (мост к телефону), `fuel.js`, `wallet.js`, `docs.js`, `season.js`, `checklists.js`, `diy.js`, `bodyphoto.js`, `calc.js`, `achievements.js`, `hub.js` (раздел «Всё для машины»), `addcar.html`, `app.js`, `app.css`, `map/podmoskovye.svg` |
| `design/` | Исходники 25 экранов из Claude Design (`*.dc.html`) и раскладка холста |
| `tools/` | `build_prototype.py` — сборка прототипа, `make_map.py` — карта Подмосковья, `make_screens.py` — типовые экраны, `bump_version.py` — номер сборки, `release_note.py` — запись в CHANGELOG и бэклог, `export_texts.js` — тексты для проверки механиком |
| `docs/` | Контекст, дорожная карта, инструкция проекта, описание API ([`docs/api.md`](docs/api.md)), бэклог задач AUTO-№ ([`docs/backlog.md`](docs/backlog.md)) |
| `tests/` | Тесты разбора документов (`node --test`), проверка предобработки OCR на JVM, эталоны синтетических нарядов |
| `tools/ocr_replay/` | Повтор OCR-конвейера APK на ПК и сверка с эталонами |
| `.github/workflows/build-apk.yml` | Тесты, сборка APK, проверка OCR на эмуляторе в авиарежиме, релиз |

## Как вносить изменения

```bash
# после правок в web/ или design/
python3 tools/build_prototype.py
# после правок координат карты
python3 tools/make_map.py && python3 tools/build_prototype.py

git add -A && git commit -m "…" && git push
```

После `git push` в `main` Actions прогонят тесты, пересоберут прототип и APK и выпустят релиз.
Перед коммитом: `node --test tests/document-parser.test.cjs tests/web-logic.test.cjs`.
Локально: откройте `app/src/main/assets/www/index.html` в браузере или запустите
`python3 -m http.server -d app/src/main/assets/www 8000` и зайдите на http://localhost:8000.

## Номер сборки

Номер сборки хранится в `VERSION` (например, `0.2`) и попадает в APK (versionName, versionCode = 100 + мажорная × 1000 + минорная)
и в подпись внизу экрана «Мой гараж». Каждая новая сборка повышает минорную версию:

```bash
python3 tools/bump_version.py          # 0.2 -> 0.3
python3 tools/build_prototype.py
python3 tools/release_note.py "AUTO-№" "- что изменилось"   # раздел в CHANGELOG, статус в бэклоге
git add -A && git commit -m "Сборка 0.3: …" && git push
```

Переход на 1.0 (`bump_version.py major`) — только по решению владельца проекта.

Релиз выпускается автоматически при пуше в `main`: «АвтоХаб <номер>», тег `v<номер>` (ставить вручную не нужно), файл `AutoHub-<номер>.apk`,
описание берётся из раздела «Сборка <номер>» в `CHANGELOG.md`. Пуш без повышения номера перезаписывает файл в релизе того же номера.
Ветки `ocr-*` собираются и проверяются, но релиз не выпускают.

## Режимы данных

По умолчанию всё работает на заглушках. `?api=live` в адресе включает реальные источники:
VIN и модели — открытая база NHTSA vPIC, остальное — бэкенд (пока не подключён). Подробно — [`docs/api.md`](docs/api.md).

Демо-данные для проверки: госномер **А123ВС 177**, VIN **XWEFC41ABKC001234**. Большой гараж на 12 машин: `?demo=fleet` в адресе.

## Обновление на телефоне

С 0.17 релиз — release-сборка (не отладочная), подписанная ключом из секретов репозитория. Ключ прототипа
из публичного репозитория удалён: с ним кто угодно мог подписать поддельное «обновление».
**Переход на 0.17 — один раз удалить старое приложение и поставить новое** (подпись другая, данные на телефоне пропадут).
Дальше обновления снова ставятся поверх.

Ключ создаёт владелец, один раз, и хранит вне репозитория с резервной копией (потеря ключа = снова переустановка у всех):

```bash
keytool -genkeypair -v -keystore autohub-release.jks -storetype PKCS12 -alias autohub -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 autohub-release.jks | gh secret set AUTOHUB_KEYSTORE_BASE64 -R pazzia/Auto
gh secret set AUTOHUB_KEYSTORE_PASSWORD -R pazzia/Auto   # пароль хранилища
gh secret set AUTOHUB_KEY_PASSWORD -R pazzia/Auto        # у PKCS12 тот же пароль
gh secret set AUTOHUB_KEY_ALIAS -R pazzia/Auto           # autohub
```

Или вручную: **Settings → Secrets and variables → Actions → New repository secret**. Без этих секретов CI собирает
и проверяет APK, но релиз не выпускает (ошибка в задаче release). Локальная подписанная сборка: задать те же
переменные окружения (`AUTOHUB_KEYSTORE_FILE` — путь к .jks) и `gradle :app:assembleRelease`.

## Сборка APK локально

Android Studio → File → Open → корень репозитория → Build → Build APK(s).
Если Studio предложит создать Gradle Wrapper — согласитесь.
