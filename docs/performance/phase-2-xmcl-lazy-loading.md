# Fase 2 — carga diferida de XMCL y adm-zip

## Cambio realizado

`main.js` conserva un helper independiente para cada módulo: `adm-zip`, `@xmcl/core`, `@xmcl/file-transfer` y `@xmcl/installer`.

- Cada helper crea una sola `Promise.resolve().then(() => require(...))`.
- Las solicitudes simultáneas reciben la misma promesa.
- Si la carga falla, el helper limpia su promesa para permitir un reintento posterior.
- Los consumidores asíncronos esperan sólo el paquete que necesitan. El arranque, splash, creación de ventana y carga inicial de configuración no llaman esos helpers.

No se tocaron `electron-updater`, `semver`, flags gráficos, renderer, cachés, logs, ventanas ni dependencias.

## Mapa de uso

| Módulo | Operaciones que lo cargan |
| --- | --- |
| `adm-zip` | importar/exportar `.mrpack`, extraer Java ZIP en Windows y precheck de nativos XMCL |
| `@xmcl/core` | validación de perfiles/nativos, loaders y lanzamiento XMCL |
| `@xmcl/file-transfer` | dispatcher de descargas del lanzamiento XMCL |
| `@xmcl/installer` | metadata de versión, instalación base, loaders y dependencias XMCL |

## Validación

- `node --check main.js`: correcto.
- Evaluación de `main.js` con un loader instrumentado: ninguna de las cuatro dependencias se requirió al cargar el módulo.
- Prueba de concurrencia y error: XMCL core/file-transfer/installer se requirieron una vez para dos llamadas simultáneas; `adm-zip` falló una vez simulada, limpió su estado y cargó correctamente al reintentar.
- `npm run perf:imports --silent`: las cuatro dependencias se cargan correctamente en el entorno local.

## Medición complementaria PSS (Node aislado)

Tres procesos Node nuevos leyeron PSS de `/proc/self/smaps_rollup` antes y después de cada `require`. No se llamó `global.gc()`.

| Paso | PSS incremental KiB, réplicas |
| --- | --- |
| `adm-zip` | 2.563 / 2.567 / 2.575 |
| `@xmcl/core` | 5.417 / 5.444 / 5.420 |
| `@xmcl/file-transfer` | 15.231 / 14.906 / 15.246 |
| `@xmcl/installer` | 9.822 / 9.423 / 9.459 |

Es una señal de coste de importación, no un reemplazo de la línea base AppImage de Fase 1 (273,4 MiB PSS en reposo, mediana).

## Reparación del entorno local (2026-07-23)

### Causa

La dependencia bloqueada es `electron@42.3.0` (el rango declarado es `^42.3.0`) y `electron-builder@26.8.1` (rango declarado `^26.0.12`). `node_modules/electron/package.json` existía, pero faltaba `node_modules/electron/path.txt` y `dist/` contenía una extracción incompleta.

- No estaban definidas `ELECTRON_SKIP_BINARY_DOWNLOAD`, `ELECTRON_OVERRIDE_DIST_PATH` ni `npm_config_ignore_scripts`; npm tenía `ignore-scripts=false`.
- El ZIP en la caché local de Electron, `electron-v42.3.0-linux-x64.zip`, pasó `unzip -t` y contenía los 74 archivos esperados.
- El instalador oficial (`node_modules/electron/install.js`) se detenía al extraer el primer archivo con `extract-zip@2.0.1`/`yauzl@2.10.0` bajo Node 26.4.0. Por eso su continuación nunca ejecutaba la escritura legítima de `path.txt`.
- El comando exacto que usa electron-builder para el árbol de producción, `npm list -a --include prod --include optional --omit dev --json --long --silent --loglevel=error`, produjo JSON válido. El fallo previo `No JSON content found in output` fue transitorio del entorno de dependencias incompleto; no requirió cambios de configuración del builder.

### Reparación mínima aplicada

Se eliminó sólo `node_modules/electron/dist/`, que era la extracción incompleta. No se eliminó `node_modules` completo ni se modificó `package.json` o el lockfile.

Se ejecutó el instalador oficial de Electron usando una envoltura temporal, fuera del repositorio, que sustituyó únicamente `extract-zip` por `unzip` para el mismo archivo de caché ya verificado. El instalador oficial hizo el paso final: movió `electron.d.ts` y escribió `path.txt`. La envoltura se eliminó inmediatamente después, por lo que no quedó instrumentación permanente.

Resultado:

- `node_modules/electron/path.txt`: `electron`.
- `node_modules/electron/dist/electron`: existe y es ejecutable (209.853.656 bytes).
- `require('electron')` resuelve a ese binario.
- El arranque de desarrollo alcanzó Kindyr y se cerró de forma controlada. La advertencia observada fue únicamente `Failed to load module "appmenu-gtk-module"`.

## Build y AppImage

`DEBUG=electron-builder npm run build:linux` terminó correctamente con Electron 42.3.0 y electron-builder 26.8.1. Generó `dist/Kindyr Launcher-1.2.0.AppImage` (124.991.157 bytes, 2026-07-23 15:15 -0300).

- `app.asar` contiene `main.js`, los preloads, los seis scripts requeridos por `index.html` y las cinco secciones funcionales.
- No contiene `tools/performance`, MemLab, Clinic, Knip, Chrome DevTools ni Codebase Memory.
- El AppImage inició con el modo gráfico seguro existente. Por CDP local temporal se comprobaron los botones `Inicio`, `Instancias`, `Descubrir`, `Skins` y `Ajustes`: cada clic activó la vista esperada. No se iniciaron instalaciones ni descargas.
- Chrome DevTools MCP permaneció con el transporte cerrado; se usó CDP directo limitado a `127.0.0.1` sólo para esa validación de navegación.
- No se ejecutó una operación de usuario XMCL o `adm-zip`: las disponibles implican importar/exportar un `.mrpack`, precheck de nativos, instalar Java en Windows o iniciar una instalación/lanzamiento, fuera del alcance de esta validación. La prueba de carga y recuperación de los helpers estáticos figura arriba.

## PSS AppImage en reposo, 60 s

Tres ejecuciones nuevas del AppImage, sin interacción y con PSS desde `/proc/<pid>/smaps_rollup`. Los procesos se agruparon por tipo; los tres procesos zygote y la utilidad auxiliar se conservan separados para no confundir PSS con RSS.

| Réplica | main | renderer | GPU | Network Service | zygote (3) | otro hijo | Total PSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 110.691 | 93.366 | 31.984 | 28.147 | 26.589 | 8.162 | 298.939 KiB |
| 2 | 102.635 | 76.272 | 31.881 | 28.112 | 26.690 | 8.198 | 273.788 KiB |
| 3 | 107.116 | 70.506 | 30.664 | 27.761 | 26.364 | 7.121 | 269.532 KiB |

| Estadístico total | PSS |
| --- | ---: |
| Mínimo | 269.532 KiB (263,2 MiB) |
| Mediana | 273.788 KiB (267,4 MiB) |
| Máximo | 298.939 KiB (291,9 MiB) |

La mediana de Fase 1 fue 279.940 KiB (273,4 MiB). Esta campaña da una diferencia de -6.152 KiB (-6,0 MiB, -2,2 %), pero no debe atribuirse por sí sola a la carga diferida: la dispersión entre réplicas y las condiciones de la sesión no permiten declarar una mejora causal.

## Comandos principales

```bash
node node_modules/electron/install.js
DEBUG=electron-builder npm run build:linux
npx --no-install electron --version
node -e "console.log(require('electron'))"
```

Para repetir el reposo, iniciar una instancia nueva del AppImage, esperar 60 segundos sin interacción y leer `tools/performance/pss.sh` con un patrón que incluya `kindyrlauncher`; cerrar todos los PID de esa instancia antes de la repetición siguiente.
