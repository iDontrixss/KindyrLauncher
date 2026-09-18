# Changelog 0.2.0-beta.2

## Discover — sidebar filters reorganized (Modrinth & CurseForge)

- The left filter panel is now organized in sections, matching the reference layout:
  `Content type` → `Game version` → `Mod loaders` → `Categories`,
  followed by the existing `Sort by` and `Results per page` controls.
- `Content type` keeps the current project types
  (`All`, `Mod`, `Modpack`, `Resource Pack`, `Shader`, `Data Pack`, `Plugin`).
- `Mod loaders` is now a chip row with only the loaders Kindyr actually supports
  (`Fabric`, `Forge`, `NeoForge`, `Quilt`). It drives the same search field as before,
  so version/loader filtering logic, direct-install context, and reset behavior are unchanged.
  (CurseForge `Worlds` are intentionally not listed yet: installing a world needs a
  saves-folder flow that does not exist.)
- New `Categories` chip section, with the official filter set of each provider:
  - **Modrinth**: official category slugs from `GET /v2/tag/category`, grouped by content
    type (e.g. mods: `adventure`, `technology`, `optimization`…; modpacks: `quests`,
    `combat`, `kitchen-sink`…; resource packs: resolutions, `realistic`, `vanilla-like`…;
    shaders: `realistic`, `cartoon`, `potato`…). Selecting one adds a `categories`
    filter to both `facets` and `new_filters` search queries.
  - **CurseForge**: official categories from `GET /v1/categories?gameId=432`, loaded at
    runtime through a new `curseforge-categories` IPC channel (cached 24h in the main
    process) and filtered by class (e.g. modpacks: `Extra Large`, `FTB Official Pack`,
    `Skyblock`, `RLCraft`, `Quests`…; mods: `Adventure and RPG`, `Technology`,
    `Magic`…). Selecting one sends `categoryId` to `/v1/mods/search`.
- With content type `All`, CurseForge shows only principal categories — names shared by
  2+ classes — so single-type ones like `128x` stay exclusive to their own type. One chip
  per name covers every class (e.g. a single `Fantasy` includes Shaders + Data Packs):
  the backend fans out one `/v1/mods/search` request per matching `categoryId` in parallel
  and merges, dedupes, and re-sorts the window (summed totals; deep pages in this mode are
  approximate since each sub-query paginates on its own).
- Category labels follow the launcher language (`cat.<slug>` Spanish dictionary, English
  falls back to the provider's original name) — including the tags on result cards and
  the detail header. Content-type names (`Mod`, `Modpack`…) and loader names
  (`Forge`, `Fabric`…) are never translated.
- `project-tag` pills are now square neobrutalist mini-cards (`radius 0`, `2px ink`,
  hard shadow) instead of rounded pills.
- Filter chips and all clickable controls follow `docs/STYLE_GUIDE.md`: square corners
  (`radius 0`), `2px ink` borders, hard shadows, and `accent` active state — no custom
  radii or palettes (now explicit rule 7 in the guide).
- The filter sidebar is wider (`300px`) so 2-3 category chips fit per line.
- Category selection resets when the provider or content type changes, and the
  `Reset` button clears it together with the other filters.
- New ES/EN strings: `discover.contentType`, `discover.modLoaders`, `discover.categories`,
  `project.info.*`, `project.link.*`, `project.close`, `cat.*`.

## Discover — in-app project details (same content as the provider website)

- Clicking a result card mirrors the browse layout instead of nesting: the sheet takes
  the results column on the left and the info block becomes a twin of the filters
  sidebar on the right (same `300px` panel, same `INFORMACIÓN` heading bar, same labeled
  groups, same `14px` gap), with an `X` chip to go back.
- The sheet header has real margins (identity padded like the `X` corner offset) and a
  `780px` minimum height; the info sidebar stretches to the same height with sticky
  content, so it stays put while scrolling.
- The detail shell is viewport-sized: only the sheet scrolls internally, the sidebar
  never moves with the page.
- The `Versions` tab follows Modrinth's own `ProjectPageVersions` (`modrinth/code`):
  a real `<table>` with shared `<colgroup>` columns (never per-row grids, which cannot
  stay aligned), capped tag lists with `+N` overflow, and relative publish dates
  (`formatRelativeTime` in `common.js`, plus a new `time.years` unit) with absolute-date
  tooltips. Columns: `Status` (name + type chip), `Game versions`,
  `Loaders` (chips with official SVG icons, capitalized, never translated), `Published`,
  `Downloads`, and a card-style `Install` button per row (CurseForge rows now carry
  per-file `downloadCount`, verified live). Each row is a card again (inset background +
  `2px ink` borders composed from its cells, orange accent on hover) while the shared
  `<colgroup>` keeps headers and rows aligned. Table rows are explicitly reset to
  `display: table-row` so the legacy `.version-row` grid styles from the instances
  view can never break them.
- CurseForge project links are limited to the official website: the public Core API does
  not expose Wiki/Discord/social links (they only exist in the Cloudflare-protected
  website HTML, which cannot be scraped from the launcher). Modrinth links are complete.
- Switching provider (Modrinth/CurseForge) while a project sheet is open closes the sheet
  and lands on that provider's section.
- Bigger table/chip type, tighter row gaps, sidebar hierarchy (bold section titles vs.
  regular smaller subtitles with breathing room), creator rows as proper cards, and no
  horizontal scrollbar in the browse section.
- The info sidebar always shows the same 4 sections (empty when the project has no data):
  `Compatibility` (split into `Minecraft Version` and `Loader` chip groups),
  `Links` (every project link: Discord, source, issues, wiki, donations…), `Tags`
  (translated categories + client/server side), `Creators` (nickname + avatar + team
  role from the source page: Modrinth team members, CurseForge authors).
- Header (icon, title, summary, downloads · followers · translated tags) plus card-style
  `Install` / `View` / `X` actions, then a content + info-sidebar layout: tabs
  (`Description` / `Versions` / `Gallery`) on the left and the official-info block
  (creator, license, client/server side, loaders, game versions, categories,
  published/updated dates, links) on the right, rendered as a clone of the filters
  sidebar (same `300px` panel, same `INFORMACIÓN` heading bar, same labeled groups,
  same `14px` gap).
  - **Modrinth**: full project fetched from `GET /v2/project/{id}`; the markdown `body`
    is rendered to HTML in the main process with `marked` (new dependency), so the
    description matches the website.
  - **CurseForge**: details from `GET /v1/mods/{id}` plus the original HTML from
    `GET /v1/mods/{id}/description`, plus `screenshots` for the gallery.
- Provider HTML is sanitized before display (tag allowlist, no scripts/handlers/styles,
  `http(s)` URLs only, relative URLs resolved against the provider site) and external
  links leave through the safe external-URL channel, never navigating the launcher.
- The `Versions` tab reuses the existing version listings; per-version install reuses
  the standard install modal.

## Discover — result counter hidden (UX only)

- The `1-18 of 10.0K results` line (`#discover-summary`) is no longer visible in either
  provider. The element stays in the DOM and the search logic still computes
  `totalHits`/`offset`, so pagination (`prev`/`next`, `1 / N`) keeps working exactly as before.

## CurseForge — datapack class fix

- `datapack` searches used class `4546`, which is actually `Customization`, so results were
  wrong/mislabeled. It now uses the official `Data Packs` class `6945`
  (verified against `GET /v1/categories?gameId=432`).

## Build — pnpm overrides declared twice on purpose

- `js-yaml ^4.3.2` and `undici ^7.28.0` are pinned in **both** `package.json >
  pnpm.overrides` **and** `overrides:` in `pnpm-workspace.yaml`, with identical
  values (do not change one without the other). pnpm 9 (CI,
  `pnpm/action-setup@v4`) only reads overrides from `package.json` and fails
  `--frozen-lockfile` without them; pnpm 11+ ignores the `package.json` field
  (warned as unread) and only reads the workspace file. Declaring both keeps
  `install --frozen-lockfile` green on either version. Verified: frozen install
  passes on pnpm 9.15.9 and 11.25.0, `pnpm audit --prod` clean
  (`js-yaml 4.3.2`, `undici 7.29.0` across the tree).
- `node_modules` was reinstalled from the frozen lockfile; the overrides were verified
  active (`js-yaml 4.3.2`, `undici 7.29.0` across the tree).
- New dependency `marked` (markdown → HTML for Modrinth descriptions, main process only).

## Instances — Control Center reorganized (unified content hub)

- The `Content` tab is now an `Additional content` hub listing **mods, resource
  packs, shaders, and datapacks together** (previously mods only), with search
  (`Search N projects...`), type filter chips (`All / Mods / Resource Packs /
  Shaders / Datapacks`), sort (`Name / Recent / Size`), an updates-only filter,
  `Upload files`, `Browse content`, `Update all`, and `Refresh`.
- Each row is a neobrutalist card showing the project's original Modrinth
  icon/title/author (manually uploaded files show as `Uploaded` with `Unknown`
  version), the installed version number plus file name, and actions: versions /
  update button, enable switch, delete (with confirm), and a `⋮` menu (view on
  Modrinth, open folder, copy file name). Checkbox column with bulk
  enable/disable/delete bar and select-all.
- The `⇄` button opens the version list for that project; when a newer version
  compatible with the instance's Minecraft version + loader exists it is
  replaced by a green `⬇` update button.
- Backend `get-instance-details` now returns a unified `content` array (kind,
  dir, enabled state, linked `projectId`/`versionId` from `modrinth-files.json`)
  plus new IPCs: `toggle-instance-content`, `delete-instance-content`,
  `upload-instance-files`, `check-content-updates`,
  `update-instance-content`, `update-all-instance-content`,
  `set-instance-content-version`. Files without metadata are identified by
  sha1 against Modrinth (`identify-instance-content`, session-level negative
  cache) so they recover icon/title/version and enter the update flow.
- New ES/EN strings: `instance.additionalContent`, `searchContent`,
  `uploadFiles`, `browseContent`, filters, sorting, bulk, updates, versions.

## Instances — "Update version" modal (⬇ and ⇄ open the same one)

- Layout mirroring the reference: header with project icon + `Update version`
  + square close button; left column with version search, channel badges
  (`R` green / `B` blue / `A` purple), version numbers and a `Current` pill;
  right panel with number + channel pill + localized date, loader/game-version
  line, and the real rendered changelog (new `modrinth-version` IPC, since the
  list endpoint ships with changelog disabled); footer with backup warning
  banner plus `Cancel` and green `Update to X` (disabled on the current
  version); `Show incompatible` toggle for versions outside the instance's
  game version. The `⬇` entry preselects the latest compatible version.
- New ES/EN strings: `instance.updateVersion`, `searchVersion`,
  `show/hideIncompatible`, `updateTo`, `updateWarning`, `noChangelog`,
  `changelogTitle`.

## UI system — buttons, checkbox, backdrop (STYLE_GUIDE compliance)

- Global `.primary-btn`/`.secondary-btn` are now neobrutalist cards (`radius
  0`, `2px ink`, `3px 3px` hard shadow, hover lift) per STYLE_GUIDE §6 —
  previously rounded and borderless, which is why Cancel/Upload/bulk buttons
  did not look like cards. All existing color overrides keep working.
- `.modal-backdrop` is translucent theme-aware (`rgba(1,7,18,0.82)` fallback +
  `color-mix(...82%, transparent)`) so the app shows dimmed/blurred behind
  modals instead of a flat theme-color plane (previously fully opaque).
- New global `.kindyr-check` custom square checkbox (ink border, hard shadow,
  green checked state) used by the hub rows and select-all — no native
  Electron checkbox styling left in the hub.
- Per-row `⇄`/`⬇`/trash/`⋮` are square bordered cards; `Update all`/`Refresh`
  and the filter toggle are bordered buttons; each project row is an
  individual card with hover lift.

## Install — loader normalization, channel retry, RP/shader fallback

- `installModrinthProject` normalizes the version filter by project kind
  (`normalizeVersionLoaderForKind`): resource packs/shaders/datapacks use
  `minecraft` instead of the instance's mod loader (previously `fabric` etc.
  filtered their `minecraft`-loader versions out, failing compatible installs
  such as Fresh Animations on Fabric 26.2 — also affected vanilla
  instances); plugins ignore mod loaders. Same fix on the CurseForge side
  (`modLoaderType` only sent for mods/modpacks).
- `installLatestRelease` retries without the `release` channel filter when no
  release matches (many packs publish everything as beta) before giving up;
  only the no-compatible error triggers the retry, never real failures.
- Resource packs/shaders with no directly compatible version fall back to the
  newest version declaring the instance's game version (any channel, installed
  silently), and only on a genuine game-version gap install the newest
  overall behind the amber warning modal (`Instalar igual` button in the
  compat list for version-only mismatches). Mods (wrong loader would not run)
  and datapacks (world-data risk) keep the hard error.
- The install modal's compat list is computed over **all** project versions
  (sampling the first 20 could mark compatible projects incompatible) and its
  installed detection also matches `content[].projectId`; fixed an undefined
  `isCF` that broke the modal's success path.
- `install.working` ("Trabajando...") removed (ES/EN); modpack installs
  (including Keo Optimized, which uses the same modal flow) say
  `Instalando...`.

## Discover — "Installed" state

- With an instance context, cards already present in the instance show a green
  outline plus a disabled `Instalado` button (matched by Modrinth `project_id`
  with slug-in-filename fallback for pre-metadata files), preventing double
  installs; badges refresh in place after installing without a new search.
- New ES/EN strings: `discover.installed`.

## CurseForge — distribution-blocked projects + Modrinth twin rescue

- Root cause, verified live: authors can set `allowModDistribution: false`,
  in which case the API returns `downloadUrl: null` on every file (e.g. Fresh
  Animations 453763, Cranch Guns) — no client-side relaxation can fix that,
  and the old `archivo sin downloadUrl` error never ran any security layer.
  `pickCurseForgePrimaryFile` now picks the newest file **among those with a
  URL** and only throws a specific distribution-disabled error when none has
  one (same for modpack zips).
- The `Solo web` state is surfaced upfront: tag + card button, `Solo web` tags
  in the detail versions table (`webOnly` flag on normalized files), banner in
  the install modal, and a friendly actionable message (`curseforge.noDistribution`)
  with an `Abrir en CurseForge` action in the error card and all install flows.
  `Solo web` cards carry an enabled `Buscar en Modrinth` button that jumps
  straight into the twin lookup instead of attempting the doomed install.
- **Twin rescue**: when CF blocks API distribution but the same project exists
  on Modrinth (exact slug, then title search with token similarity; strict
  gates on type + title + team author, modpacks/plugins excluded, session
  cache), the launcher offers installing from Modrinth behind an explicit
  consent modal showing both sources — never a silent substitution. Wired into
  direct install, the compat modal (`Buscar en Modrinth` → installs through
  the twin), via new `curseforge-find-twin` IPC. Verified end-to-end against
  the live APIs (exact match, fuzzy-slug match, author/type rejections).
- New ES/EN strings: `curseforge.noDistribution`, `webOnly`, `openSite`,
  `twin.*`, `compat.*`.

## Settings — eager prepare graduated (no longer beta)

- `Preparar instancias` is a regular option in Recursos (BETA badge, yellow
  experimental styling, and `settings.beta.*` keys removed → `settings.prepare.*`),
  **ON by default** for new/untouched profiles (explicit opt-outs respected),
  still toggleable in Settings.
- It now actually prepares in **every** creation path via the shared
  `runEagerPrepare()` helper (toast + real `prepare-instance` call + background
  completion wait, `ready/failed/off` states): custom instance creation,
  Modrinth/CurseForge modpack installs into new instances, and `.mrpack`
  imports from both the library and the create flow (`import-mrpack` now
  returns `instanceId`; shared `afterModpackImport()`). Previously modpack
  flows only showed the toast without preparing.

## Instances — read-only Console tab (only console; legacy removed)

- New 5th Control Center tab showing `launcher-logs/latest.log` **unfiltered**
  (full lines, intact whitespace, raw game stdout/stderr) via new
  `read-instance-console` IPC (bounded initial tail + byte-offset incremental
  reads that never split lines and detect log rotation), plus ~1.2s live
  polling guarded by visible tab + current instance, with a 5000-line view
  buffer. Read-only: no command input (Copy, Follow, Refresh, and view-clear
  buttons only); Follow sticks to bottom unless the user scrolled up; running
  state comes from the real launcher status.
- Idle state renders ASCII art (speech balloon rebuilt to the active
  language's width — one text per language, never both) with per-character
  colors applying **only** to the drawing (`#` black, `B` blue, `:` navy,
  `K` white). Live lines are colored like an average terminal (amber warnings,
  red errors) without ever filtering any line out; rendering is incremental so
  polls append nodes instead of rebuilding thousands of spans.
- Closing the game empties the view back to the ASCII art (per-instance dead
  sessions + drain-to-EOF so the old tail never reloads; a new launch revives
  via log rotation); the manual clear button behaves the same without touching
  the file.
- The legacy `Consola de inicio` panel is gone entirely (template, renderer
  wiring/buffer, CSS across themes, `instance.console`/`instance.clear`
  strings, STYLE_GUIDE console entry now points at `.console-tab-view`) —
  the tab is the single console.
- New ES/EN strings: `instance.consoleTab`, `consoleIdle`, `console.live`,
  `console.stopped`, `console.lines`, `console.follow`, `console.copy`,
  `console.copied`, `console.clear`.

## Instances — drag & drop file upload (with content sniffing)

- Files (`.jar`/`.zip`, plus `.disabled` variants) can now be dragged from the
  file manager and dropped directly onto the "Contenido adicional" panel of an
  open instance (title, toolbar and file list) and nowhere else — no more
  system file dialog for the common case. Drops anywhere else are swallowed so the window never navigates away
  to a `file://` URL.
- The existing `upload-instance-files` IPC channel was extended with an
  optional `filePaths` array (absent = native dialog, behavior unchanged).
  Renderer-side, the drop handler only accepts trusted OS drops
  (`event.isTrusted` + real `File.path`); synthetic JS events are ignored.
- Every dropped path is revalidated in main: must exist, be a regular file,
  stay under 2 GiB, survive `basename`+`sanitizeFileName` (no traversal), and
  match the `.jar`/`.zip` allowlist — max 20 files per drop, rest reported in
  a per-file `skipped[]` list (`empty/type/missing/not-file/too-large/exists`)
  instead of failing the batch. Preload caps the path array at 50 entries so a
  hostile array never pays full IPC serialization cost.
- Content sniffing before copy (new `content-sniff.js`, zero new dependencies —
  `@xmcl/mod-parser`/`@xmcl/resourcepack` are not installed, so classification
  reuses the audited `@xmcl/unzip` wrappers): `.jar` must contain a known mod
  descriptor (`META-INF/mods.toml`, `META-INF/neoforge.mods.toml`,
  `fabric.mod.json`, `quilt.mod.json` at root or `META-INF/`, `mcmod.info`) or
  it lands in `skipped` as `unrecognized`; `.zip` containing
  `modrinth.index.json`/`manifest.json` at root is rejected as `is-modpack`
  with a pointer to the modpack installer; otherwise `pack.mcmeta` (+
  `assets/` vs `data/` tree) decides resourcepack vs datapack, `shaders/` at
  root decides shader, and anything else is `unrecognized`. Unreadable archives
  report `unreadable` instead of copying blind. The detected kind (and mod
  loader for jars) decides the destination folder; manual uploads still skip
  hash verification by product decision (no trusted hash source exists for
  user files — same as dialog uploads).
- Status line composes `uploadedOk` + skipped count, with a dedicated
  modpack message (`instance.uploadIsModpack`). New ES/EN strings:
  `instance.uploadSkipped`, `instance.uploadIsModpack`, `instance.dropHint`
  (also used as the upload button tooltip).
- Packaging: `content-sniff.js` added to `build.files` and to
  `REQUIRED_ASAR_FILES` (without it the installed app would crash on startup
  while dev worked — caught before release).
- New `test/content-sniff.test.js`: real fixture ZIPs asserting every loader,
  multi-loader jars, modpack-first ordering, assets-vs-data split, shader,
  garbage and non-ZIP cases; `test/drop-upload.test.js` extended with handler
  integration + renderer guidance assertions.

## Tests

- `scripts/check-syntax.js` now also compiles inline `<script>` blocks from HTML files
  (a stray paren in `sections/descubrir.html` once broke the whole Discover section
  without any check catching it) with a regression test to keep it that way.

- New `test/discover-categories.test.js`: Modrinth slug normalization, `category`/`categoryIds`
  wiring in `main.js`, `curseforge-categories` IPC + preload exposure, the `6945` class fix,
  the new Discover panel elements, STYLE_GUIDE-compliant chips, and the new i18n keys.
- New `test/discover-details.test.js`: `marked` rendering parity, details IPCs + preload,
  project section markup/tabs, card click-through, HTML sanitizer rules, rich-URL policy,
  translated categories, and multi-category fan-out merge behavior.
- New `test/install-compat-fallback.test.js`: loader normalization per kind, channel
  retry in `installLatestRelease`, silent game-version match before the warning modal,
  full-version-list compat computation, and the CurseForge loader-filter fix.
- New `test/curseforge-distribution.test.js`: downloadable-file preference in the CF
  picker, distribution-disabled error semantics, actionable i18n, `webOnly` plumbing
  to cards/versions/modal, twin-match rules (slug/type/title/team-author, modpack and
  plugin exclusions), IPC + preload wiring, and consent-modal UI hooks.
- New `test/eager-prepare.test.js`: ON-by-default settings, beta graduation (keys,
  badge, toggle ids), the shared `runEagerPrepare` helper and its adoption in
  create/modpack/CF/import flows, `Instalando` copy, and `instanceId` on
  `.mrpack` import.
- New `test/instance-console.test.js`: unfiltered-tail IPC semantics, tab
  markup and read-only controls, guarded live polling, no-truncation
  rendering, behavioral `classifyConsoleLine` cases via `vm`, per-language
  idle text, per-character ASCII colors, close-clear/dead-session/clear-button
  flows, and absence of every legacy-console token.
- Full suite green (173 tests), `node scripts/check-syntax.js` clean.

## Auto-updater — beta channel fix (`allowPrerelease`)

- `configureAutoUpdater` set `updater.allowPrerelease = false`, which silently
  broke beta-to-beta updates: with `false`, electron-updater resolves the
  version via `GET /releases/latest`, an endpoint that excludes prereleases by
  definition (verified in electron-updater 6.8.9 source:
  `GitHubProvider.getLatestTagName`). With only prereleases published,
  `checkForUpdates()` always failed with `ERR_UPDATER_LATEST_VERSION_NOT_FOUND`
  and the prerelease consent dialog was dead code (fail-closed, no crash — but
  no updates either; the `update.json` gate itself uses the releases API and
  *did* see the newer beta, so it passed just for electron-updater to fail).
- Now `allowPrerelease = true`: the provider scans the Atom feed, picks
  same-channel (`beta`) prereleases, looks for `latest-beta.yml` and falls back
  to `latest.yml` (verified fallback in `GitHubProvider`), so the existing 5
  release assets cover it with no new files. No downgrade side effect: that is
  only forced by the `.channel` setter (never used); `allowDowngrade` stays
  `false` and the `update.json` + confirmation + semver gates still apply.
- New `release-safety` test pins `allowPrerelease = true` with
  `allowDowngrade = false`.
