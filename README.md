# Kindyr Launcher

Kindyr es un launcher de escritorio para Minecraft construido con Electron. Permite administrar cuentas Microsoft, instancias, loaders y modpacks de Modrinth, además de configurar Java, memoria y skins.

## Requisitos de desarrollo

- Node.js 24 LTS recomendado; se admiten versiones desde 22.12 y anteriores a 26.
- **pnpm** (no npm).
- Linux o Windows.
- En Linux, un llavero compatible con Secret Service o KWallet para guardar credenciales Microsoft.

## Desarrollo

```bash
pnpm install
pnpm check:syntax
pnpm test
pnpm start
```

Electron 42 expone un instalador separado. El `postinstall` del proyecto lo ejecuta automáticamente cuando Electron está presente y muestra un error claro si el runtime de Node no es compatible.

## Empaquetado

```bash
pnpm build:linux
pnpm build:win
```

Los artefactos se crean en `dist/`. Las credenciales de Microsoft se cifran con el almacenamiento seguro del sistema y nunca se exponen al renderer.

## Estado de lanzamiento

La versión declarada es `0.1.0` (beta). Antes de publicar, debe completarse [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), incluida la validación en una instalación limpia, la firma de artefactos y la configuración del repositorio remoto. El changelog es local (`CHANGELOG.md` ignorado en git) — no se commitea.

### Publicar una actualización (control manual)

El auto-update es manual y seguro: aunque subas una release a GitHub, **no se ofrece hasta que ejecutes `pnpm update-kindyr`**.

```bash
# Desde la carpeta del proyecto (importante):
cd C:\KindyrLauncher
pnpm update-kindyr

# Si estás en otra carpeta, usa:
pnpm --dir C:\KindyrLauncher update-kindyr
# o
node C:\KindyrLauncher\scripts\update-kindyr.js

# También podés hacer doble click en update-kindyr.bat
```

El comando actualiza `update.json` (`approvedAt` nuevo) y habilita **un solo ciclo** 5s→3s→5s en todos los launchers. Sin ese comando, una release vulnerada subida a GitHub no se descarga.

## Seguridad y privacidad

Consulta [SECURITY.md](SECURITY.md), [docs/PRIVACY.md](docs/PRIVACY.md) / [docs/PRIVACY.en.md](docs/PRIVACY.en.md).

## Legal

- Español: [Términos de uso](docs/TERMINOS_DE_USO.md)
- English: [Terms of Use](docs/TERMS_OF_USE.md)
- Español: [Política de privacidad](docs/PRIVACY.md)
- English: [Privacy Policy](docs/PRIVACY.en.md)
- [License](LICENSE)

## Licencia

El código propio se distribuye bajo **GPL-3.0-or-later** — ver [LICENSE](LICENSE). Se puede usar, modificar y compartir el programa siempre que se mantenga la misma licencia y se comparta el código fuente.
