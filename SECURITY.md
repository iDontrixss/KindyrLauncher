# Seguridad

## Versiones compatibles

Hasta la primera publicación, solo la versión más reciente del código recibirá correcciones de seguridad.

## Reportar una vulnerabilidad

No publiques credenciales, tokens, datos personales ni una prueba de concepto peligrosa en un issue público. Usa el sistema privado de avisos de seguridad de GitHub cuando el repositorio esté disponible. Si todavía no está habilitado, contacta al responsable del proyecto por un canal privado conocido.

Incluye una descripción del impacto, versión afectada, pasos mínimos para reproducir y cualquier mitigación conocida. No incluyas datos de terceros.

## Propiedades esperadas

- El renderer no recibe tokens de acceso Microsoft.
- Las credenciales persistentes requieren cifrado seguro del sistema.
- El contenido de archivos ZIP no puede escribir fuera de su destino.
- Las navegaciones y ventanas conservan `contextIsolation`, sandbox y `nodeIntegration` desactivado.
- Las URLs abiertas o descargadas por IPC se validan en el proceso principal.
