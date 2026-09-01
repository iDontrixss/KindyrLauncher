# Changelog

Todos los cambios relevantes de Kindyr se documentarán en este archivo.

## [1.2.0] - Sin publicar

### Añadido

- Administración de cuentas Microsoft, instancias, loaders, modpacks y skins.
- Empaquetado para Linux AppImage y Windows NSIS.
- Pruebas automatizadas para almacenamiento de cuentas, skins y archivos ZIP.

### Cambiado

- XMCL es el único motor de instalación y lanzamiento de Minecraft.
- Carga diferida de los módulos XMCL.
- Límites para cachés, colas de logs y extracción de archivos.
- Mejoras en el ciclo de vida de ventanas y en la memoria del renderer.

### Seguridad

- Credenciales Microsoft cifradas mediante el almacén seguro del sistema.
- Sesiones Microsoft renovables de forma persistente sin exponer el token de renovación al renderer.
- Tokens eliminados de la API expuesta al renderer.
- Descargas de skins limitadas a HTTPS y proveedores previstos.
- Extracción ZIP con protección contra path traversal, enlaces y archivos descomprimidos excesivos.
- Dependencias de producción auditadas sin vulnerabilidades conocidas al 31 de julio de 2026.

### Corregido

- La vista dinámica de una instancia libera su DOM, listeners visuales y timers al salir.
- La importación `.mrpack` descarga realmente sus archivos de cliente, prueba URLs alternativas y verifica SHA-512/SHA-1.
- El instalador recomendado usa el flujo visual de Kindyr en lugar del diálogo heredado de Zotlin.

[1.2.0]: https://github.com/iDontrixss/KindyrLauncher/releases/tag/v1.2.0
