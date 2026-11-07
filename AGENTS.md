# Інтерактивний портал роду: Монакови • Руденки • Облажевич (Блажевич) • Петрови • фон Герлах

Цей проєкт оптимізований для роботи з динамічним дизайном у **Google Antigravity**, **OpenAI Codex** або **Cursor** та безкоштовного хостингу на **Cloudflare Pages**, **GitHub Pages** або **Vercel**.

## Підключені сучасні бібліотеки для динамічного дизайну
1. **GSAP 3.12 (`gsap.min.js`)** — плавні анімації переходів між вкладками, staggered-поява карток у галереї, мікроанімації інспектора та повноекранного Lightbox.
2. **Panzoom 4.5 (`@panzoom/panzoom`)** — інтерактивне полотно для генеалогічного дерева (перетягування мишкою/пальцем, плавний зум `55%–250%`, скидання в `100%`).
3. **Leaflet 1.9 + CartoDB Voyager + Animated Migration Polylines** — інтерактивна карта з промальованими пунктирними маршрутами переселень усіх 4 гілок роду (включно з маршрутом Даугавпілс → Рига → Сидней, травень 1968 р.).
4. **Lucide Icons (`lucide.min.js`)** — сучасна векторна іконографіка.
5. **Tailwind CSS 3.4** — швидка кастомізація стилів, glassmorphism-ефектів та адаптивної сітки.
6. **`package.json` зі стеком `@xyflow/react` (React Flow v12) + `framer-motion`** — готовий маніфест залежностей, якщо ви попросите Antigravity/Codex перевести проєкт на React SPA з кастомними Bezier-вузлами React Flow.

## Як вносити правки зі слів мами (за 10 секунд)
Усі біографії, дати, підписи, маршрути та фотографії винесені в один чистий файл **`js/data.js`**:
- `PEOPLE_DATA` — картки всіх предків (VII–I покоління).
- `ARCHIVE_GALLERY_ITEMS` — скомпоновані оцифровані документи та світлини для Lightbox-галереї.
- `MAP_LOCATIONS` та `MIGRATION_ROUTES` — історичні точки та маршрути міграцій на карті.

## Автоматична синхронізація з Google Doc та Google Drive («онови з файлу / гуглдоку»)
Коли користувач просить **«онови з файлу»** або **«онови з гуглдоку»**, інший чат Gemini постійно записує нові генеалогічні оновлення (Оновлення #1, #2, ..., #N) у спільний Google Doc та завантажує нові оцифровані фото у спільну папку Google Drive:
- **Google Doc зі списком оновлень (`ANTIGRAVITY_SYNC_UPDATE_Shibik_Kyiv_Semipalatinsk.md`)**:
  - Document ID: `1QSfQRiBZTxp_y9PTpc62nVK7oQ8f-XooCgbdd50lcv4`
  - URL: `https://docs.google.com/document/d/1QSfQRiBZTxp_y9PTpc62nVK7oQ8f-XooCgbdd50lcv4/edit`
  - Команда для читання: `gdocs readonly read 1QSfQRiBZTxp_y9PTpc62nVK7oQ8f-XooCgbdd50lcv4`
- **Спільна папка Google Drive з оцифрованими фото та документами роду**:
  - Folder ID: `1D_R2FLKA0OnjD-sx1HCiBLx6torqTjxk`
  - Команда для перегляду файлів: `gdrive readonly ls 1D_R2FLKA0OnjD-sx1HCiBLx6torqTjxk --max 100 --json`
  - Завантажуйте нові фото через `gdrive readonly download <FILE_ID> --out assets/docs/...`, інтегруйте зміни у `js/data.js` та `index.html`, після чого робіть `git commit` та `git push` на GitHub Pages (`main`).
