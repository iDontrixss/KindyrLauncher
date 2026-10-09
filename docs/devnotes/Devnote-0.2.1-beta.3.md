# Devnote 0.2.1-beta.3 — Importar desde otro launcher

Función: elegir launcher (Prism, CurseForge, Modrinth App, SKLauncher, oficial),
listar sus instancias e importar las elegidas junto a la importación por archivo
(`import-mrpack`, intacta). Principio rector: corrección antes que rapidez;
origen de terceros = solo lectura y datos no confiables, nunca órdenes.

## 1. Adaptadores (`external-launchers/`, un archivo por launcher + `shared.js`)

Por qué un archivo por launcher y no ramas en `main.js`: cada formato ajeno
evoluciona por su cuenta (pistas del prompt ya refutadas: no existe tabla
`profiles` en `app.db`, `instance.cfg` usa `name=` minúscula, el game-dir de
Prism es `minecraft/` no `.minecraft/`). Aislarlos permite corregir un formato
sin tocar los demás ni el flujo existente, y testearlos sin Electron
(son módulos Node puros, sin `require('electron')`).

Por qué contrato común `{ id, name, gameDir, minecraftVersion, loader,
loaderVersion, sizeBytes, supported, reason, shared }` (`shared.js`): el IPC y
la UI tratan a los 5 launchers igual; la única bifurcación real es el lector
de metadatos. `loader` es canónico (`vanilla|fabric|forge|neoforge|quilt`) o
`null`; `null` => `supported:false` con `reason`. Nunca se elige loader a
ciegas porque un loader erróneo deja una instancia rota que cuesta horas.

Por qué proyección a whitelist dentro del adaptador: cada JSON ajeno se lee
con `safeReadJson` (tope 1 MiB, `shared.js`) y solo los campos declarados
salen del adaptador (`parse*` eligen campo por campo). El objeto completo no
llega al IPC, a la UI ni a logs (verificado con test de tokens falsos y veto
a `console.*` en los 7 módulos). Así, aunque un `instances.json` trajera
`accessToken`, no hay camino de fuga.

Por qué `shared.js` centraliza `walkSizeBytes`/`normalizeLoaderName`/
`mcVersionLike`: el tamaño se calcula solo con `stat` (sin abrir ficheros,
sin seguir symlinks, con tope de 20.000 entradas y exclusión de
logs/cachés/natives) y el loader con un único mapa; dos implementaciones
divergirían en qué es "fabric".

Detalle por launcher (todo verificado en instalaciones reales de esta máquina,
salvo lo marcado):
- Prism (`prism.js`): raíz por defecto `%APPDATA%\PrismLauncher` (sin clave
  `InstanceDir` en `prismlauncher.cfg`, que igual se respeta si aparece:
  `parseInstanceDirOverride`). `mmc-pack.json` se recorre por `uid`
  (`net.minecraft`, `net.fabricmc.fabric-loader`, …) en vez de posiciones
  fijas. Se excluyen directorios ocultos (`.tmp/<id>/` son creaciones a
  medias, no instancias). Versiones de 2 partes (`26.3`) aceptadas.
- CurseForge (`curseforge.js`): raíz real `~\curseforge\minecraft\Instances`
  primero; la histórica `Documents\Curse\…` queda segunda y sin verificar.
  Loader desde `baseModLoader.name` + versión desde `forgeVersion`; los
  `type` numéricos NO se mapean (solo hay muestra de `type:4`); `isVanilla`
  manda a vanilla. `.curseclient` (guid) se ignora.
- Modrinth (`modrinth.js`): `app.db` está en modo WAL, y abrir un SQLite en
  WAL aunque sea `readOnly` puede tocar `-shm`; por eso `copyAppDbToTemp`
  copia `app.db` + `-wal`/`-shm` a `kindyr-modrinth-db-*` y solo se abre la
  copia (luego se borra). Solo `SELECT` a `instances`,
  `instance_content_sets` y `settings.custom_dir`; las tablas de credenciales
  están en `NEVER_TABLES` y un test audita que ningún `FROM` las nombre.
- SKLauncher (`sklauncher.js`): la carpeta de instancia ES el game-dir
  (`mods/`, `options.txt` en raíz, sin subcarpeta `minecraft/`); `directory`
  manda si existe, si no `<root>/instances/<id>`. `latest-release` literal
  no es versión => no compatible. `versionId` (`1.21.1-neoforge-21.1.247`)
  solo rescata lo que `gameType`/`loaderVersion` no dan.
- Oficial (`official.js`): un perfil sin `gameDir` USA la raíz `.minecraft`
  compartida (`shared:true`); la UI debe avisar que se copia una vez por
  perfil (`summarizeGameDirs` en `shared.js`). `lastVersionId` se parsea por
  regex documentadas con muestras reales; `neoforge-21.1.248` (sin MC) y
  `latest-release` quedan no compatibles.
- macOS: sin raíces darwin a propósito (package.json solo empaqueta win+linux;
  proponer rutas que no se pueden probar sería Suposición disfrazada).

## 2. IPC y copia (`ipc.js`, `importer.js`; `main.js` solo registra)

Por qué `ipc.js` separado en vez de handlers inline en `main.js`: el registro
en `main.js` es 1 línea; toda la validación vive testeable sin Electron, y el
harness E2E lo cargó tal cual en un main mínimo con IPC real (27 checks).

Por qué validación estricta en main (`ipc.js`): `launcherId` contra allowlist,
`gameDir` absoluta + `isDirectory`, `name`/`loaderVersion` acotados,
`minecraftVersion` con regex, `loader` contra `CANONICAL_LOADERS`, `selection`
solo claves conocidas coaccionadas a boolean, `importId` alfanumérico. La UI
no es frontera de confianza.

Por qué staging + rename (`importer.js`, `STAGING_PREFIX =
'.tmp-kindyr-import-'` en el mismo `dataRoot`): el rename es atómico dentro
del mismo volumen y el origen jamás se toca; en fallo/cancel se borra el
staging (y el destino si el rename ya ocurrió pero falló el registro), nunca
`instances/` ajeno ni el origen. Valida antes: plan no vacío, espacio libre
(`statfs`, fail-closed si no alcanza), `signal` abortado.

Por qué allowlist de copia (mods, config, resourcepacks, shaderpacks, saves,
`options.txt`, `servers.dat`) + `ALWAYS_EXCLUDED` en todos los niveles: se
copia lo que el usuario juega y se excluyen logs/crash-reports/cachés aunque
vengan anidados; los symlinks se saltan para no escapar del origen.

Por qué `AbortController` con `pipeline(..., { signal })` por fichero: cancela
de verdad a mitad de copia (incluso dentro de un fichero grande), no "entre
instancias". Sin `signal` no se pasa la opción (`pipeline` rechaza `null`).

Por qué nombre con sufijo (`uniqueInstanceName`): el registro permite
nombres repetidos en otros launchers (visto "Base" dos veces en Modrinth);
aquí no se sobrescribe: `Nombre (2)`, `(3)`, … El `instanceId` lleva
timestamp+azar y se re-genera si colisiona.

Por qué registro atómico (tmp + `renameSync` en `saveCustomInstances` y
`saveRegistry`): un corte de luz a mitad de escritura antes dejaba
`instances.json` truncado y TODAS las instancias desaparecían del launcher;
ahora el registro anterior sobrevive. Mismo directorio => mismo volumen =>
rename atómico.

Por qué purga solo por prefijo (`purgeStaleTempDirs`, al registrar el IPC):
solo hijos directos de `dataRoot` con `.tmp-kindyr-import-*` y de `os.tmpdir`
con `kindyr-modrinth-db-*`; `instances/` ni se lista.

## 3. UI (modal Importar propio + paso `external` en Crear)

Por qué modal propio `#import-modpack-modal` en vez de reutilizar el de Crear:
título ("Importar", no "Crear instancia"), exactamente 2 opciones y cero
estado compartido (el bug de fuga vino de un `hidden` global). Agregar quedó
con Personalizado + Descubrir; Importar vive en toolbar/inicio y abre su
modal. `createImportMrpack` cierra ambos modales; la vía de archivo no cambió.

Por qué la lista replica la estructura de referencia (pathbar, PERFILES (n),
Limpiar, checkbox a la derecha, pie con total + Continuar): es lo que el
usuario ya conoce de esas pantallas; el estilo (tokens, radio 0, sombras)
sigue siendo STYLE_GUIDE, no la imagen.

Por qué checkboxes nativos (guía §10): teclado, lector de pantalla y los 8
temas gratis; simularlos con divs/SVG rompería accesibilidad y temas. Van en
`label`-fila con `accent-color: var(--kindyr-accent)` y estado `disabled` +
motivo para no compatibles.

Por qué X y Volver siempre visibles y Continuar siempre (deshabilitado si 0):
fue pedido explícito tras probar; el footer global del Crear se oculta en
`external` para no duplicar (X/volver/cancelar dobles), y la vista aporta los
contextuales (Volver→launchers→menú Importar).

Por qué `afterModpackImport(result)` reutilizado y toast existente: mismo
post-import (refresh + eager prepare + estado) que la vía de archivo, sin
duplicar lógica; el resultado del importer ya tiene su forma
(`{ok,cancelled,instanceId,name,warnings,error}`).

Por qué `escapeHtml` + `t()` en todo HTML dinámico y test anti-hex en CSS:
nombres/rutas ajenos son no confiables (inyección), y los 8 `data-theme`
comparten tokens (verificado por mención, sin captura visual).

## 4. Marcas y empaquetado

Por qué `assets/external/*.svg` aportados y no dibujados: el usuario los
aportó y ordenó usarlos. Estado legal real: Prism oficial CC BY-SA 4.0 con
atribución en cabecera (único legítimo); curseforge/modrinth/sklauncher/
official bajo responsabilidad del usuario (Modrinth exige permiso escrito de
Rinth, Inc.; resto, marcas de terceros). Tile con fondo `var(--kindyr-ink)`
para que los blancos se vean en todos los temas. `assets/**/*` ya los incluye
en el asar (verificado win 3515 fich / linux 3514 con los 7 de
`external-launchers/`).

## 5. Pendientes honestos

- `walkSizeBytes` síncrono bloquea main (oficial 28,5 s, Modrinth 8,2 s):
  mover a worker/`utilityProcess`, no "optimizar".
- Lanzamiento real del juego importado (requiere descarga + cuenta).
- `dist-check/` bloqueado por escáner externo (ignorado en git, borrar manual).
- Sintética Prism `KindyrE2E-synthetic` dejada a propósito en su sitio.
