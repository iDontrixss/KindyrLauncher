# Kindyr Launcher

Kindyr es un launcher de escritorio para Minecraft construido con Electron. Permite administrar cuentas Microsoft, instancias, loaders y modpacks de Modrinth, además de configurar Java, memoria y skins.

## Requisitos de desarrollo

- Node.js 24 LTS recomendado; se admiten versiones desde 22.12 y anteriores a 26.
- npm.
- Linux o Windows.
- En Linux, un llavero compatible con Secret Service o KWallet para guardar credenciales Microsoft.

## Desarrollo

```bash
npm ci --include=dev
npm run check:syntax
npm test
npm start
```

Electron 42 expone un instalador separado. El `postinstall` del proyecto lo ejecuta automáticamente cuando Electron está presente y muestra un error claro si el runtime de Node no es compatible.

## Empaquetado

```bash
npm run build:linux
npm run build:win
```

Los artefactos se crean en `dist/`. Las credenciales de Microsoft se cifran con el almacenamiento seguro del sistema y nunca se exponen al renderer.

## Estado de lanzamiento

La versión declarada es `1.2.0`. Antes de publicar, debe completarse [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), incluida la validación en una instalación limpia, la firma de artefactos y la configuración del repositorio remoto.

## Seguridad y privacidad

Consulta [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licencia

El código propio se distribuye bajo la licencia ISC incluida en [LICENSE](LICENSE). Los componentes de terceros mantienen sus propias licencias.
