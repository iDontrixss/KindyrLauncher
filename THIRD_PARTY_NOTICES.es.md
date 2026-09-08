# Avisos de terceros

> [English](THIRD_PARTY_NOTICES.md)

Kindyr Launcher es software libre bajo **GPL-3.0-or-later** (ver [LICENSE](./LICENSE)). Se puede usar, modificar y compartir, siempre que se mantenga la misma licencia y se entregue el código fuente.

Kindyr incorpora software y servicios de terceros. Sus licencias y términos prevalecen para esos componentes.

## 1. Servicios externos contactados por Kindyr

Según la función utilizada, la aplicación se comunica directamente con los siguientes servicios. No se envía telemetría propia de Kindyr; solo el tráfico necesario para la función solicitada (versiones, autenticación, búsqueda, descarga). Cada servicio aplica su propia política de privacidad y términos.

| Servicio | Uso en Kindyr | Endpoint principal |
|---|---|---|
| **Microsoft / Xbox / Minecraft Services** | Autenticación Microsoft, Xbox, perfil y skins | `https://api.minecraftservices.com`, `https://authserver.mojang.com`, `https://api.mojang.com`, `https://sessionserver.mojang.com` |
| **Mojang (Piston)** | Manifiesto de versiones y recursos del juego | `https://piston-meta.mojang.com`, `https://piston-data.mojang.com` |
| **Modrinth** | Búsqueda, versiones y descarga de mods/modpacks | `https://api.modrinth.com/v2`, `https://cdn.modrinth.com`, `https://modrinth.com` |
| **CurseForge** | Búsqueda e instalación de mods y modpacks | `https://api.curseforge.com/v1`, `https://www.curseforge.com`, `https://edge.forgecdn.net` |
| **Adoptium (Eclipse Temurin)** | Distribuciones de Java | `https://api.adoptium.net/v3` |
| **Fabric** | Metadatos de loader | `https://meta.fabricmc.net/v2` |
| **Quilt** | Metadatos de loader | `https://meta.quiltmc.org/v3` |
| **Forge** | Metadatos y artefactos | `https://maven.minecraftforge.net` |
| **NeoForge** | Metadatos y artefactos | `https://maven.neoforged.net/releases` |
| **GitHub** | Comprobación de actualizaciones y puerta `update.json` | `https://api.github.com/repos/iDontrixss/KindyrLauncher`, `https://raw.githubusercontent.com/iDontrixss/KindyrLauncher` |
| **mc-heads.net** | Avatares y previsualización de skins | `https://mc-heads.net` |
| **jsDelivr / skinview3d** | Librería de render 3D de skins | `https://cdn.jsdelivr.net/npm/skinview3d@3.4.1` |

Estos servicios reciben la información técnica normal de una conexión (IP, User-Agent `KindyrLauncher/0.1.0-beta.1`), sin identificadores propios de Kindyr.

## 2. Paquetes npm incluidos en el build

Extraído de `package.json` y verificado contra `pnpm-lock.yaml`. Solo se listan dependencias que llegan al artefacto final; las de `devDependencies` no se empaquetan. Este proyecto usa **pnpm** (no npm); no existe `package-lock.json`.

- **Electron 42** — MIT. Runtime del launcher.
- **XMCL** (`@xmcl/core` 2.15.1, `@xmcl/file-transfer` 2.0.3, `@xmcl/installer` 6.1.2, `@xmcl/unzip` 2.1.2) — MIT. Motor único de instalación/lanzamiento de Minecraft. Se distribuyen desde el monorepo `Voxelum/minecraft-launcher-core-node`; el antiguo `minecraft-launcher-core` (MCLC) fue eliminado del proyecto.
- **electron-updater 6 / electron-builder 26** — MIT. Actualización y empaquetado NSIS/AppImage.
- **Font Awesome Free 6.7.2** — Iconos CC BY 4.0, fuentes SIL OFL 1.1, código MIT.
- **ffmpeg-static 5.3.0** — El paquete npm es GPL-3.0-or-later y distribuye un binario FFmpeg `6.1.1-essentials_build-www.gyan.dev` compilado con `--enable-gpl --enable-version3` (incluye libx264/libx265). **Ese binario es GPL versión 3**, compatible con la licencia GPL-3.0-or-later de Kindyr. Se usa solo para convertir fondos de video locales (`settings-pick-background`). Código fuente de FFmpeg e instrucciones en `https://ffmpeg.org/legal.html` y `https://www.gyan.dev/ffmpeg/builds/`.
- **msmc 5.0.5** — MIT. Flujo Microsoft/Xbox.
- **semver 7.8.x** — ISC. Comparación de versiones del actualizador.
- **tar 7.5.x** — BlueOak-1.0.0. Utilidades de archivos.
- **yazl 2.5.1** — MIT. Escritura de ZIP (exportación `.mrpack`).
- **Transitivas fijadas por `overrides`:** `js-yaml` ^4.3.2, `undici` ^7.28.0 (actualizadas vía `pnpm-lock.yaml` para corregir vulnerabilidades).

## 3. Herramientas de desarrollo (no se empaquetan)

`electron` (dev), `electron-builder`, `clinic`, `knip`, `memlab` — solo para `pnpm start`, `pnpm build:*`, `pnpm perf:*` y `knip`. No están en el ASAR (ver `scripts/after-pack.js` `FORBIDDEN_ASAR_PATTERNS`).

## 4. Recursos gráficos y fuentes

- **skinview3d 3.4.1** (vía jsDelivr) — MIT. Render de skins en `sections/skins.html`.
- **Space Grotesk / JetBrains Mono** — SIL Open Font License 1.1.
- Iconos de la app en `assets/icon.ico`, `assets/logo-*.png` — propios de Kindyr, bajo GPL-3.0-or-later.

## 5. Obligaciones al distribuir

Antes de publicar un artefacto, debe conservarse este archivo dentro del ASAR (`scripts/after-pack.js` verifica `LICENSE` y `THIRD_PARTY_NOTICES*.md` dentro del ASAR) y, como el artefacto incluye el binario FFmpeg GPLv3, acompañarse con este aviso y el acceso al código fuente indicado arriba. Ejecuta `pnpm check:syntax`, `pnpm test`, `pnpm audit --omit=dev` y `pnpm ls --depth 0` en limpio con `pnpm-lock.yaml` sincronizado con `package.json`.

Referencias:

- https://www.electronjs.org/
- https://github.com/Voxelum/minecraft-launcher-core-node
- https://fontawesome.com/license/free
- https://ffmpeg.org/legal.html
- https://github.com/eugeneware/ffmpeg-static
- https://www.gyan.dev/ffmpeg/builds/
- https://api.modrinth.com, https://api.curseforge.com, https://api.adoptium.net
- https://meta.fabricmc.net, https://meta.quiltmc.org, https://maven.minecraftforge.net, https://maven.neoforged.net
- https://mc-heads.net, https://cdn.jsdelivr.net/npm/skinview3d
