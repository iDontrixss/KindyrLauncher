# Política de seguridad

> English? See [SECURITY.md](SECURITY.md).

## Versiones compatibles

| Versión | Soporte de seguridad |
|---|---|
| Última beta (`0.1.0-beta.x`) | ✅ Recibe correcciones |
| Anteriores (`V1.x`, betas privadas) | ❌ Sin soporte, actualizar |

## Reportar una vulnerabilidad

**No abras un issue público** para vulnerabilidades. No publiques tokens, credenciales, datos personales ni pruebas de concepto que pongan en riesgo a otros usuarios.

Usa una de estas vías privadas:

1. **Avisos privados de GitHub**: <https://github.com/iDontrixss/KindyrLauncher/security/advisories/new>
2. **Email**: `KindyrSupport@gmail.com` con asunto `[SECURITY] breve descripción`

Incluye: impacto, versión afectada, pasos mínimos para reproducir y mitigación conocida si la hay. No incluyas datos de terceros.

## Qué esperar

- Confirmación de recepción en ~7 días.
- Si se confirma, el parche sale en la siguiente beta y se da crédito público al reportero (salvo que pida anonimato).
- Nunca te pediremos credenciales ni tokens por email.

## Modelo de seguridad

Lo que el diseño garantiza y se audita antes de cada release:

- El renderer no recibe tokens de acceso Microsoft.
- Las credenciales persistentes requieren cifrado seguro del sistema.
- El contenido de archivos ZIP no puede escribir fuera de su destino.
- Las navegaciones y ventanas conservan `contextIsolation`, sandbox y `nodeIntegration` desactivado.
- Las URLs abiertas o descargadas por IPC se validan en el proceso principal.

Sobre tus datos personales, ver [Política de privacidad](legal/PRIVACY.md).
