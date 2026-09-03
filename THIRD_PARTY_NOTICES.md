# Avisos de terceros

Kindyr Launcher es software libre bajo **GPL-3.0-or-later** (ver [LICENSE](../LICENSE)). Se puede usar, modificar y compartir, siempre que se mantenga la misma licencia y se entregue el código fuente.

Kindyr incorpora software de terceros. Sus licencias prevalecen para esos componentes y son compatibles con GPL-3.0-or-later:

- Electron — MIT.
- XMCL (`@xmcl/core`, `@xmcl/file-transfer`, `@xmcl/installer`, `@xmcl/unzip`) — MIT.
- electron-updater / electron-builder — MIT.
- Font Awesome Free — iconos bajo CC BY 4.0, fuentes bajo SIL OFL 1.1 y código bajo MIT.
- `ffmpeg-static` distribuye un binario de FFmpeg. FFmpeg puede distribuirse bajo LGPL o GPL según cómo esté configurado y compilado, por lo que es necesario verificar el build que se incluye y cumplir con su licencia. El código fuente correspondiente y la información de compilación están disponibles desde el proyecto `ffmpeg-static` y FFmpeg.
- `msmc`, `semver`, `tar`, `yazl` y sus dependencias — según las licencias incluidas en cada paquete.

Antes de publicar un artefacto, debe conservarse este archivo, verificarse el inventario exacto del ASAR y acompañarse el binario de FFmpeg con los avisos y acceso al código fuente exigidos por su licencia.

Referencias:

- https://www.electronjs.org/
- https://github.com/Voxelum/minecraft-launcher-core-node
- https://fontawesome.com/license/free
- https://ffmpeg.org/legal.html
- https://github.com/eugeneware/ffmpeg-static
