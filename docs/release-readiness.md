# Preparación de la primera versión

Fecha de revisión: 31 de julio de 2026  
Rama: `main`  
Commit base: `becee684ed1f249dea5073cc4394067290dbf2b9`

## Resultado

El código queda considerablemente más cerca de una primera versión, pero todavía no debe publicarse como estable. La aplicación Linux construye e inicia; la publicación sigue bloqueada por validaciones funcionales reales, firma, repositorio remoto y prueba del actualizador.

## Correcciones realizadas

- MCLC fue retirado del código, dependencias y paquete. XMCL es el único motor de instalación y lanzamiento.
- Se eliminó también el adaptador `token.mclc()` de MSMC; las credenciales se obtienen desde la API neutral `getToken()`.
- Las cuentas Microsoft se guardan cifradas con `safeStorage`. El backend Linux `basic_text` se rechaza.
- El renderer recibe cuentas sanitizadas sin tokens; la aplicación online de skins recupera el token solo en el proceso principal.
- El guardado local de skins ahora escribe el archivo real. Las imágenes se limitan a 5 MiB, PNG decodificable y dimensiones Minecraft.
- Las URLs de skins y enlaces externos se limitan a HTTPS y hosts previstos.
- `adm-zip` fue reemplazado por extracción/escritura en streaming con límites de entradas, bytes por archivo y bytes totales, además de rechazo de traversal y enlaces.
- Se retiraron las dependencias directas sin uso `form-data`, `adm-zip` y `minecraft-launcher-core`.
- `tar`, `undici` y `js-yaml` quedaron en versiones corregidas mediante el lockfile.
- Se añadieron pruebas, comprobación de sintaxis, Knip limpio, CI Linux/Windows y documentación básica de distribución, privacidad, seguridad y licencias.
- La vista de detalle de instancia se descarta al salir para no retener su árbol DOM y timers de actualización.
- Se corrigió una referencia inexistente a `safePath()` que podía impedir que el importador `.mrpack` copiara sus mods; ambos flujos ahora validan rutas, URLs y hashes.
- El diálogo de instalación de Modrinth fue actualizado al diseño de Kindyr.

## Validación ejecutada

- `pnpm check:syntax`: 25 archivos JavaScript válidos.
- `pnpm test`: 4 archivos de prueba, todos aprobados.
- `pnpm perf:knip`: sin hallazgos.
- `pnpm audit --omit=dev`: 0 vulnerabilidades de producción.
- `pnpm ls --omit=dev --all`: árbol válido; MCLC ausente.
- `pnpm build:linux`: AppImage creado correctamente.
- AppImage: `Kindyr Launcher-1.2.0.AppImage`, 159.116.621 bytes, ejecutable.
- Inspección de ASAR: helpers nuevos y scripts de UI presentes; MCLC, `adm-zip`, pruebas, documentación y herramientas de rendimiento ausentes.
- Ejecución breve del AppImage: proceso principal, renderer, GPU y servicio de red creados; cierre limpio.
- `pnpm build:win`: el contenido Windows se empaquetó, pero NSIS no pudo completarse en Linux porque Wine no está instalado. La CI Windows añadida debe hacer esta validación en su plataforma nativa.

## Entorno reproducible

Electron 42 ya no declara un `postinstall` propio; expone el ejecutable `install-electron`. El proyecto lo invoca desde su `postinstall`.

Node 26.4.0 no completó ese instalador, aunque encontró el ZIP oficial en caché. Node 24.14.0 sí creó `path.txt`, extrajo el binario y permitió construir. Por eso:

- `.nvmrc` fija Node 24;
- `package.json` admite `>=22.12 <26`;
- CI usa Node 24.

## Riesgos y bloqueos restantes

1. Probar login Microsoft y migración de una cuenta real en Windows, Secret Service y KWallet.
2. Instalar y lanzar al menos una instancia vanilla y una por cada loader compatible. Esta revisión no descargó ni lanzó Minecraft.
3. Probar importación/exportación de un `.mrpack` real y casos ZIP hostiles en la aplicación empaquetada.
4. Probar cambio de skin real contra Minecraft Services.
5. Ejecutar el instalador NSIS en Windows 10/11.
6. Configurar firma de código de Windows y estrategia verificable para AppImage.
7. Configurar `origin`; en esta copia no hay remoto ni etiquetas.
8. Crear el repositorio/canal privado de seguridad y verificar que el destino configurado para electron-updater existe.
9. Probar una actualización completa desde una versión anterior.
10. Revisar y cumplir la redistribución GPL de FFmpeg.

Las 32 alertas del audit completo pertenecen a herramientas de desarrollo/perfilado y no entran en el paquete. El árbol de producción tiene cero alertas; actualizar o sustituir las herramientas de diagnóstico debe hacerse por separado para no mezclar cambios con el runtime.

## Siguiente paso exacto

En una máquina Windows limpia con Node 24:

```bash
pnpm install --include=dev
pnpm check:syntax
pnpm test
pnpm audit --omit=dev
pnpm build:win
```

Después, completar las pruebas funcionales de [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md), configurar firma y remoto, y solo entonces crear la etiqueta `v1.2.0`.
