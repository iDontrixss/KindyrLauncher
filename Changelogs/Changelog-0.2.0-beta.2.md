# Changelog 0.2.0-beta.2

## Discover — reorganized filters

The Discover sidebar has been reorganized to better match the reference layout:

`Content type` → `Game version` → `Mod loaders` → `Categories` → `Sort by` → `Results per page`

### Content type

* Existing project types remain available:

  `All`, `Mod`, `Modpack`, `Resource Pack`, `Shader`, `Data Pack`, `Plugin`.

### Mod loaders

* Replaced the previous loader control with chips for the loaders Kindyr actually supports:

  `Fabric`, `Forge`, `NeoForge`, `Quilt`.

* Uses the existing search/filter logic, so direct-install context, version filtering, and reset behavior remain unchanged.

* CurseForge `Worlds` are intentionally excluded for now because world installation requires a saves-folder flow that does not yet exist.

### Categories

* Added provider-native category filters.

* **Modrinth:** categories are loaded from `GET /v2/tag/category` and grouped according to content type.

* **CurseForge:** categories are loaded from `GET /v1/categories?gameId=432` through a new `curseforge-categories` IPC channel and cached for 24 hours.

* Category selection is passed to the corresponding provider search API.

* When `All` is selected on CurseForge, only categories shared by two or more classes are shown. A single chip can therefore represent multiple matching classes; Kindyr fans out the searches, merges and deduplicates the results, and re-sorts them.

* Category selection resets when changing provider or content type, and `Reset` clears it together with the other filters.

* Category labels follow the launcher language. Spanish uses Kindyr's `cat.*` translations, while English falls back to the provider's original name.

* Content-type and loader names are never translated.

* The filter sidebar is now `300px` wide so category chips have more room.

### Visual consistency

* `project-tag` elements are now square neobrutalist mini-cards instead of rounded pills.

* Filter chips and clickable controls now consistently follow `docs/STYLE_GUIDE.md`:

  * `radius: 0`

  * `2px` borders

  * hard shadows

  * `accent` active state

* Added the required ES/EN strings for Discover and project details.

---

## Discover — in-app project details

Clicking a Discover result now opens the project directly inside Kindyr instead of sending the user to a separate provider page.

### Layout

* The project sheet mirrors the Discover browse layout.

* Results remain on the left while project information occupies a `300px` sidebar on the right.

* The information sidebar uses the same `INFORMACIÓN` heading, section hierarchy, spacing, and visual language as the filter sidebar.

* The sheet has a minimum height of `780px`, real header margins, and an internal scrolling content area.

* The sidebar remains sticky while the project content scrolls.

* An `X` action returns to the results.

* Switching between Modrinth and CurseForge automatically closes the project sheet and moves to the selected provider.

### Project information

The sidebar contains:

* `Compatibility`

  * Minecraft Version

  * Loader

* `Links`

  * Discord, source, issues, wiki, donations, etc.

* `Tags`

  * translated categories

  * client/server side

* `Creators`

  * nickname

  * avatar

  * team role where provided by the source

### Description, versions and gallery

Project details now include:

* `Description`

* `Versions`

* `Gallery`

The header shows the project icon, title, summary, downloads, followers, translated tags, and card-style `Install`, `View`, and `X` actions.

The official project information block includes creator, license, client/server side, loaders, game versions, categories, publication/update dates, and available links.

### Versions table

The Versions tab now follows the structure of official file lists:

* Status

* Game versions

* Loaders

* Published

* Downloads

* Install

Additional details:

* Loader chips use official SVG icons and are never translated.

* CurseForge rows use the live per-file `downloadCount`.

* Fixed-width columns keep headers and rows aligned.

* Missing dates display an em-dash.

* Rows have no visible borders and use a subtle surface hover state.

* Existing version installation is reused through the standard install modal.

### Provider support

**Modrinth**

* Full project data is fetched from `GET /v2/project/{id}`.

* Markdown descriptions are rendered to HTML with the new `marked` dependency.

**CurseForge**

* Project details come from `GET /v1/mods/{id}`.

* Descriptions come from `GET /v1/mods/{id}/description`.

* Screenshots are used for the gallery.

* Project links are limited to those exposed by the official Core API. Wiki, Discord, and social links are not exposed there.

### Security

* Provider HTML is sanitized before rendering.

* Scripts, event handlers, styles, and unsupported tags are removed.

* Only `http(s)` URLs are allowed.

* Relative URLs are resolved against the provider website.

* External links are opened through Kindyr's safe external-URL channel and never navigate the launcher directly.

---

## Discover — result counter hidden

* Removed the visible `1-18 of 10.0K results` counter from both providers.

* `totalHits` and `offset` are still calculated internally.

* Pagination (`prev` / `next`, `1 / N`) continues to work exactly as before.

---

## CurseForge — Data Pack search fix

* Data Pack searches were incorrectly using class `4546`, which corresponds to `Customization`.

* Kindyr now uses the official Data Packs class `6945`.

* Verified against `GET /v1/categories?gameId=432`.

---

## CurseForge — blocked downloads + Modrinth rescue

* Some authors disable automatic downloads (`Solo web` tag). Instead of a dead-end error, Kindyr offers installing the same project from Modrinth when it is published there by the same author — always with your explicit confirmation, never silently.

---

## Instances — unified content hub + drag & drop

* Mods, resource packs, shaders, and datapacks now live together in one "Additional content" hub with search, filters, one-click updates, and bulk enable/disable/delete.

* `.jar`/`.zip` files can be dragged straight from the file manager onto the panel. Every file is validated (type, size, real content) before it is accepted; uploads no longer freeze the launcher while copying.

---

## Instances — live Console tab

* New read-only Console tab in the Control Center shows the game's live log, with Follow, Copy, and Clear. The old startup console panel is gone.

---

## Instances — automatic preparation

* New instances prepare themselves (Java + Minecraft) right after creation, so the first launch is instant. Toggleable in Settings → Resources.

---

## Build

### pnpm overrides

* Pins live in **both** `package.json` (`pnpm.overrides`) and `pnpm-workspace.yaml` (`overrides:`) on purpose — pnpm 9 (CI) only reads them from `package.json`, pnpm 11+ only from the workspace file. Do not change one without the other.

* `js-yaml ^4.3.2` and `undici ^7.28.0` verified active (`js-yaml 4.3.2`, `undici 7.29.0`).

* Reinstalled dependencies from the frozen lockfile.

### Dependencies

* Added `marked` for rendering Modrinth Markdown descriptions in the main process.

---

## Tests

* `scripts/check-syntax.js` now compiles inline `<script>` blocks contained in HTML files.

* Added a regression check for inline HTML scripts after a syntax error in `sections/descubrir.html` previously went undetected.

* Added `test/discover-categories.test.js` covering:

  * Modrinth category normalization

  * category/categoryIds wiring

  * CurseForge category IPC and preload exposure

  * Data Pack class `6945`

  * Discover panel elements

  * STYLE_GUIDE-compliant chips

  * i18n keys

* Added `test/discover-details.test.js` covering:

  * Markdown rendering

  * Details IPCs and preload exposure

  * Project sections and tabs

  * Card click-through

  * HTML sanitization

  * External URL handling

  * Translated categories

  * Multi-category CurseForge fan-out and merging

### Verification

* Full test suite: **green**

* `node scripts/check-syntax.js`: **clean**

---

## Install note

* SmartScreen will warn because this beta is not code-signed (a certificate costs ~€300/yr). It is safe: More info → Run anyway.

* Beta-to-beta updates now work: the launcher offers new betas automatically (with your confirmation). Previously the updater could never find prereleases.

* Optional integrity check (PowerShell):

  `Get-FileHash "Kindyr Launcher Setup 0.2.0-beta.2.exe" -Algorithm SHA256`

  * EXE: `94D63581CC5B8AE777ABB7C6C030D84E06A9151F71568E1BED7B7AA665DD98A1`
  * AppImage: `3C3397A430EB8082D621DCA5CCFAA117B89FC88523AC445ABE3B66590156F762`
