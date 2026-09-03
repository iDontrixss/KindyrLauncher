# Lista de lanzamiento

## Código y dependencias

- [ ] El árbol de trabajo contiene únicamente los cambios destinados a la versión.
- [ ] `npm ci --include=dev`, `npm run check:syntax`, `npm test` y `npm ls --include=dev` pasan.
- [ ] `npm audit --omit=dev` informa cero vulnerabilidades.
- [ ] MCLC, herramientas de diagnóstico y archivos de respaldo no aparecen en el ASAR.
- [ ] La versión coincide en `package.json`, nombres de artefactos y etiqueta Git (changelog es local, no se commitea — ver `CHANGELOG.md` ignorado).

## Pruebas funcionales

- [ ] Instalación limpia en una distribución Linux compatible.
- [ ] Instalación limpia en Windows 10/11.
- [ ] Inicio y cierre, navegación por las cinco vistas y recreación de ventanas.
- [ ] Login, cambio y cierre de sesión Microsoft con llavero disponible y no disponible.
- [ ] Instalación y lanzamiento de una instancia vanilla.
- [ ] Instalación y lanzamiento de Fabric, Quilt, Forge y NeoForge.
- [ ] Importación/exportación Modrinth y rechazo de ZIP malicioso.
- [ ] Cambio y guardado de skins.
- [ ] Actualización desde una versión anterior.

## Distribución

- [ ] Configurar el remoto `origin` y verificar el repositorio de publicación.
- [ ] Activar protección de rama y CI.
- [ ] Configurar y verificar firma de código de Windows.
- [ ] Definir firma o checksums verificables para AppImage.
- [ ] Confirmar obligaciones de redistribución GPL-3.0-or-later: `LICENSE` incluida en el artefacto y cabeceras `SPDX` en cada fuente.
- [ ] Confirmar obligaciones de redistribución de FFmpeg y avisos de dependencias (ver `package.json` y licencias en `node_modules`).
- [ ] Crear una etiqueta firmada `v0.1.0` (o siguiente beta).
- [ ] Publicar checksums SHA-256 y probar cada artefacto descargado.
- [ ] Comprobar que electron-updater encuentra y valida la nueva versión.
- [ ] Mantener un canal privado para reportes de seguridad.

No debe marcarse la versión como estable mientras falten pruebas de instalación/lanzamiento real, firma o verificación del actualizador.
