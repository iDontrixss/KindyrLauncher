# Proceso principal (main.js + main/)

`main.js` es solo el punto de entrada: arranque, manejo de errores fatales,
ciclo de vida de la app (`whenReady`, `before-quit`, `window-all-closed`).
La lógica vive en `main/`, ordenada por dominio. Los módulos no tienen
dependencias circulares: cada uno solo importa de los que están "debajo".

## Capas (de abajo hacia arriba)

| Capa | Módulos |
| --- | --- |
| Base | `constants`, `paths`, `util`, `state`, `ipc-guard`, `lazy-deps`, `xmcl-shim`, `file-protocol` |
| Infra | `http`, `settings`, `storage`, `diagnostics`, `window-helpers`, `session-security`, `launch/log`, `orphan` |
| Datos | `instances-store`, `accounts`, `java`, `versions`, `download`, `providers/*` |
| Casos de uso | `instance-create`, `instance-content`, `install/*`, `launch/*`, `skins`, `updater`, `fatal`, `windows` |
| IPC | `ipc/*` (cada archivo registra sus canales `ipcMain.handle/on` al cargarse) |

## Reglas

- **El renderer no es de confianza.** Muestra HTML de terceros (descripciones y
  changelogs de Modrinth/CurseForge), así que todo lo que llega por IPC se trata
  como entrada hostil aunque el emisor sea una ventana propia:
  - HTML de proveedores → solo `sanitizeProviderHtml()` (`html-sanitizer.js`),
    que construye un fragmento nuevo con lo permitido y se inserta con
    `replaceChildren()`. Nunca `innerHTML` con HTML de terceros.
  - Rutas del sistema de archivos → `isLocalAbsolutePath()` (`util`): nada de
    UNC ni rutas de dispositivo. Ejecutables (Java) → procedencia aprobada
    (`isTrustedJavaBinary`), o confirmación en un diálogo nativo.
  - Argumentos de lanzamiento → lista de permitidos (`launch/args.js`).
  - Claves que indexan diccionarios → `Object.hasOwn`.
- **`file://` restringido** (`file-protocol.js`): se intercepta el esquema y
  solo se sirve la app, el fondo y los iconos de instancia. Si la UI necesita
  mostrar otro archivo local, agrégalo ahí con su patrón y su test.
- **Permisos web** (`session-security.js`): todos denegados salvo escribir en el
  portapapeles desde la app. Descargas iniciadas por el renderer: bloqueadas.
- **Red**: llamadas a APIs con `fetchWithTimeout()` (`http.js`); las descargas
  grandes van por `download.js`.
- **Estado mutable compartido** → `main/state.js` (`state.mainWindow`,
  `state.minecraftProcess`, ...). Variables que usa un solo módulo siguen
  siendo locales a ese módulo.
- **IPC**: `main.js` instala `guardIpcRegistrations()` *antes* de cargar
  cualquier módulo `ipc/*`. Eso envuelve `ipcMain.handle/on`: todo canal
  rechaza emisores que no sean una ventana propia sirviendo un `file://` dentro
  de la carpeta de la app (fail-closed). No hace falta repetir el chequeo en
  cada handler, aunque los destructivos lo conservan.
- **Rutas**: los módulos usan `APP_ROOT` (raíz de la app, dentro del ASAR al
  empaquetar) en lugar de `__dirname`.
- **Argumentos personalizados de Java** (`launch/args.js`): `-X…`/`-D…` van a la
  JVM; el resto al juego. Hay una lista de bloqueo (agentes, classpath,
  `-XX:OnError`, `-Xmx/-Xms`, ...). La RAM se gestiona desde los ajustes.
- Los tests que verifican contratos de código fuente leen
  `test/helpers/main-source.js`, que concatena `main.js` y `main/**`.

## Añadir un canal IPC

1. Elige (o crea) el archivo en `main/ipc/` que corresponda al dominio.
2. Registra con `ipcMain.handle('canal', ...)`; ya pasa por la guardia.
3. Expónlo en `preload.js` y valida forma/tamaño de la entrada en el handler.
