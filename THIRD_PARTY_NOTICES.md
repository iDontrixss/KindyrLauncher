# Avisos de terceros

Kindyr Launcher es software libre bajo **GPL-3.0-or-later** (ver [LICENSE](../LICENSE)). Se puede usar, modificar y compartir, siempre que se mantenga la misma licencia y se entregue el código fuente.

Kindyr incorpora software y servicios de terceros. Sus licencias y términos prevalecen para esos componentes y son compatibles con GPL-3.0-or-later.

## 1. Servicios externos contactados por Kindyr

Según la función utilizada, la aplicación se comunica directamente con los siguientes servicios. No se envía telemetría propia de Kindyr; solo el tráfico necesario para la función solicitada (versiones, autenticación, búsqueda, descarga). Cada servicio aplica su propia política de privacidad y términos.

| Servicio | Uso en Kindyr | Endpoint principal |
|---|---|---|
| **Microsoft / Xbox / Minecraft Services** | Autenticación Microsoft, Xbox, perfil y skins | `https://api.minecraftservices.com`, `https://authserver.mojang.com`, `https://api.mojang.com`, `https://sessionserver.mojang.com` |
| **Mojang (Piston)** | Manifiesto de versiones y recursos del juego | `https://piston-meta.mojang.com`, `https://piston-data.mojang.com` |
| **Modrinth** | Búsqueda, versiones y descarga de mods/modpacks | `https://api.modrinth.com/v2`, `https://cdn.modrinth.com`, `https://modrinth.com` |
| **CurseForge** | Búsqueda alternativa de mods | `https://api.curseforge.com/v1`, `https://www.curseforge.com` |
| **Adoptium (Eclipse Temurin)** | Distribuciones de Java | `https://api.adoptium.net/v3` |
| **Fabric** | Metadatos de loader | `https://meta.fabricmc.net/v2` |
| **Quilt** | Metadatos de loader | `https://meta.quiltmc.org/v3` |
| **Forge** | Metadatos y artefactos | `https://maven.minecraftforge.net`, `https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml` |
| **NeoForge** | Metadatos y artefactos | `https://maven.neoforged.net/releases`, `https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml` |
| **GitHub** | Comprobación de actualizaciones | `https://api.github.com/repos/iDontrixss/KindyrLauncher` |
| **mc-heads.net** | Avatares y previsualización de skins | `https://mc-heads.net` |
| **jsDelivr / skinview3d** | Librería de render 3D de skins | `https://cdn.jsdelivr.net/npm/skinview3d@3.4.1` |

Estos servicios reciben la información técnica normal de una conexión (IP, User-Agent `KindyrLauncher/0.1.0`), sin identificadores propios de Kindyr.

## 2. Paquetes npm incluidos en el build

Extraído de `package.json:39` y verificado contra `package-lock.json` y `pnpm-lock.yaml` (ambos actualizados a `0.1.0` y `GPL-3.0-or-later`). Solo se listan dependencias que llegan al artefacto final; las de `devDependencies` no se empaquetan.

- **Electron 42** — MIT. Runtime del launcher.
- **XMCL** (`@xmcl/core` 2.15.1, `@xmcl/file-transfer` 2.0.3, `@xmcl/installer` 6.1.2, `@xmcl/unzip` 2.1.2) — MIT. Motor único de instalación/lanzamiento de Minecraft (reemplaza MCLC).
- **electron-updater / electron-builder 26** — MIT. Actualización y empaquetado NSIS/AppImage.
- **Font Awesome Free 6.7.2** — Iconos CC BY 4.0, fuentes SIL OFL 1.1, código MIT.
- **ffmpeg-static 5.3.0** — paquete bajo GPL-3.0-or-later que descarga binarios estáticos de FFmpeg. **Binario distribuido por Kindyr en Windows: `ffmpeg.exe` 64-bit `6.1.1-essentials_build-www.gyan.dev` desde `www.gyan.dev`, con licencia `GPL v3` (ver `node_modules/ffmpeg-static/ffmpeg.exe.LICENSE` y `ffmpeg.exe.README`).** Código fuente FFmpeg correspondiente: `https://github.com/FFmpeg/FFmpeg/commit/e38092ef93` y configuración `release-essentials`. Cualquier redistribución debe acompañarse del aviso GPL v3 y acceso al fuente. Referencias: `https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1`, `https://www.gyan.dev/ffmpeg/builds/`, `https://ffmpeg.org/legal.html`.
- **msmc 5.0.5** — MIT (`package.json:license MIT`, repo `https://github.com/Hanro50/MSMC`). Flujo Microsoft/Xbox/Microsoft Authentication Library.
- **semver 7.8.4** — ISC (`node_modules/semver/package.json:license ISC`, GitHub Inc.).
- **tar 7.5.22** — BlueOak-1.0.0 (`node_modules/tar/package.json:license BlueOak-1.0.0`, autor Isaac Z. Schlueter). Implementación `tar` para `mrpack` y backups.
- **yazl 2.5.1** — MIT (`node_modules/yazl/package.json:license MIT`, autor Josh Wolfe). Creación ZIP.
- **skinview3d 3.4.1** (vía `https://cdn.jsdelivr.net/npm/skinview3d@3.4.1`) — MIT (`https://cdn.jsdelivr.net/npm/skinview3d@3.4.1/package.json:license MIT`, autor Haowei Wen, repo `https://github.com/bs-community/skinview3d`). No está en `package.json`, se carga bajo demanda en `sections/skins.html:5` y solo contacta jsDelivr.
- **Transitivas relevantes fijadas por `overrides`:** `js-yaml` ^4.3.2 (MIT), `undici` ^7.28.0 (MIT) — actualizadas vía `package-lock.json`/`pnpm-lock.yaml` para corregir vulnerabilidades.

## 3. Herramientas de desarrollo (no se empaquetan)

- `clinic` 13, `knip` 6.33, `memlab` 2.0 — solo para `npm run perf:*` y `knip`. No están en el ASAR (ver `scripts/after-pack.js` `FORBIDDEN_ASAR_PATTERNS`).

## 4. Recursos gráficos y fuentes

- **skinview3d 3.4.1** (vía jsDelivr) — MIT. Render de skins en `sections/skins.html`.
- **Space Grotesk / JetBrains Mono** — según licencia de cada fuente (SIL OFL).
- Iconos de la app en `assets/icon.ico`, `assets/logo-*.png` — propios de Kindyr, bajo GPL-3.0-or-later.

## 5. Obligaciones al distribuir

Antes de publicar un artefacto, debe conservarse este archivo, verificarse el inventario exacto del ASAR (`scripts/after-pack.js` verifica `LICENSE` y `THIRD_PARTY_NOTICES.md` dentro del ASAR) y, si el artefacto incluye el binario de FFmpeg, acompañarse con los avisos y acceso al código fuente exigidos por su licencia. Ejecuta `npm run check:syntax`, `npm test`, `npm audit --omit=dev` y `npm ls` en limpio y conserva `package-lock.json` y `pnpm-lock.yaml` sincronizados con `package.json` (ambos actualizados en esta reorganización: `package-lock.json` pasó de `1.2.0/ISC/^2.15.1` a `0.1.0/GPL-3.0-or-later/2.15.1`).

Referencias:

- https://www.electronjs.org/
- https://github.com/Voxelum/minecraft-launcher-core-node
- https://fontawesome.com/license/free
- https://ffmpeg.org/legal.html
- https://github.com/eugeneware/ffmpeg-static
- https://api.modrinth.com, https://api.curseforge.com, https://api.adoptium.net
- https://meta.fabricmc.net, https://meta.quiltmc.org, https://maven.minecraftforge.net, https://maven.neoforged.net
- https://mc-heads.net, https://cdn.jsdelivr.net/npm/skinview3d

