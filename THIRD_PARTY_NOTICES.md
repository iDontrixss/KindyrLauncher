# Third-party notices

> [Español](THIRD_PARTY_NOTICES.es.md)

Kindyr Launcher is free software under **GPL-3.0-or-later** (see [LICENSE](./LICENSE)). You may use, modify and share it, as long as you keep the same license and provide the source code.

Kindyr bundles third-party software and contacts third-party services. Their licenses and terms prevail for those components.

## 1. External services contacted by Kindyr

Depending on the feature used, the application talks directly to the following services. Kindyr sends no telemetry of its own; only the traffic required for the requested feature (versions, authentication, search, downloads). Each service applies its own privacy policy and terms.

| Service | Use in Kindyr | Main endpoint |
|---|---|---|
| **Microsoft / Xbox / Minecraft Services** | Microsoft/Xbox authentication, profile and skins | `https://api.minecraftservices.com`, `https://authserver.mojang.com`, `https://api.mojang.com`, `https://sessionserver.mojang.com` |
| **Mojang (Piston)** | Version manifest and game resources | `https://piston-meta.mojang.com`, `https://piston-data.mojang.com` |
| **Modrinth** | Search, versions and downloads of mods/modpacks | `https://api.modrinth.com/v2`, `https://cdn.modrinth.com`, `https://modrinth.com` |
| **CurseForge** | Alternative search and install of mods and modpacks | `https://api.curseforge.com/v1`, `https://www.curseforge.com`, `https://edge.forgecdn.net` |
| **Adoptium (Eclipse Temurin)** | Java distributions | `https://api.adoptium.net/v3` |
| **Fabric** | Loader metadata | `https://meta.fabricmc.net/v2` |
| **Quilt** | Loader metadata | `https://meta.quiltmc.org/v3` |
| **Forge** | Metadata and artifacts | `https://maven.minecraftforge.net` |
| **NeoForge** | Metadata and artifacts | `https://maven.neoforged.net/releases` |
| **GitHub** | Update checks and the `update.json` gate | `https://api.github.com/repos/iDontrixss/KindyrLauncher`, `https://raw.githubusercontent.com/iDontrixss/KindyrLauncher` |
| **mc-heads.net** | Avatars and skin previews | `https://mc-heads.net` |
| **jsDelivr / skinview3d** | 3D skin-render library | `https://cdn.jsdelivr.net/npm/skinview3d@3.4.1` |

These services receive the normal technical information of a connection (IP, User-Agent `KindyrLauncher/0.1.0-beta.1`), with no Kindyr-specific identifiers.

## 2. npm packages included in the build

Taken from `package.json` and verified against `pnpm-lock.yaml`. Only dependencies that reach the final artifact are listed; `devDependencies` are not packaged. This project uses **pnpm** (not npm); there is no `package-lock.json`.

- **Electron 42** — MIT. Launcher runtime.
- **XMCL** (`@xmcl/core` 2.15.1, `@xmcl/file-transfer` 2.0.3, `@xmcl/installer` 6.1.2, `@xmcl/unzip` 2.1.2) — MIT. Sole Minecraft install/launch engine. Shipped from the `Voxelum/minecraft-launcher-core-node` monorepo; the old `minecraft-launcher-core` (MCLC) was removed from the project.
- **electron-updater 6 / electron-builder 26** — MIT. NSIS/AppImage updates and packaging.
- **Font Awesome Free 6.7.2** — Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT.
- **ffmpeg-static 5.3.0** — The npm package is GPL-3.0-or-later and ships an FFmpeg binary `6.1.1-essentials_build-www.gyan.dev` built with `--enable-gpl --enable-version3` (includes libx264/libx265). **That binary is GPL version 3**, compatible with Kindyr's GPL-3.0-or-later license. It is only used to convert local background videos (`settings-pick-background`). FFmpeg source code and instructions at `https://ffmpeg.org/legal.html` and `https://www.gyan.dev/ffmpeg/builds/`.
- **msmc 5.0.5** — MIT. Microsoft/Xbox flow.
- **semver 7.8.x** — ISC. Updater version comparison.
- **tar 7.5.x** — BlueOak-1.0.0. Archive utilities.
- **yazl 2.5.1** — MIT. ZIP writing (`.mrpack` export).
- **Transitives pinned via `overrides`:** `js-yaml` ^4.3.2, `undici` ^7.28.0 (bumped via `pnpm-lock.yaml` to fix vulnerabilities).

## 3. Dev tools (not packaged)

`electron` (dev), `electron-builder`, `clinic`, `knip`, `memlab` — only for `pnpm start`, `pnpm build:*`, `pnpm perf:*` and `knip`. Not in the ASAR (see `scripts/after-pack.js` `FORBIDDEN_ASAR_PATTERNS`).

## 4. Graphics and fonts

- **skinview3d 3.4.1** (via jsDelivr) — MIT. Skin rendering in `sections/skins.html`.
- **Space Grotesk / JetBrains Mono** — SIL Open Font License 1.1.
- App icons in `assets/icon.ico`, `assets/logo-*.png` — Kindyr's own, under GPL-3.0-or-later.

## 5. Obligations when distributing

Before publishing an artifact, keep this file inside the ASAR (`scripts/after-pack.js` checks for `LICENSE` and `THIRD_PARTY_NOTICES*.md` inside the ASAR) and, as the artifact includes the GPLv3 FFmpeg binary, ship this notice with the source access stated above. Run `pnpm check:syntax`, `pnpm test`, `pnpm audit --omit=dev` and `pnpm ls --depth 0` clean with `pnpm-lock.yaml` in sync with `package.json`.

References:

- https://www.electronjs.org/
- https://github.com/Voxelum/minecraft-launcher-core-node
- https://fontawesome.com/license/free
- https://ffmpeg.org/legal.html
- https://github.com/eugeneware/ffmpeg-static
- https://www.gyan.dev/ffmpeg/builds/
- https://api.modrinth.com, https://api.curseforge.com, https://api.adoptium.net
- https://meta.fabricmc.net, https://meta.quiltmc.org, https://maven.minecraftforge.net, https://maven.neoforged.net
- https://mc-heads.net, https://cdn.jsdelivr.net/npm/skinview3d
