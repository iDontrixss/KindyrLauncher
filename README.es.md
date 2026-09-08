# Kindyr Launcher

> **[English](README.md)** · Proyecto independiente. No afiliado a Mojang Studios ni Microsoft.

Kindyr es un launcher de escritorio para Minecraft construido con Electron. Administrá cuentas Microsoft, instancias, loaders y modpacks de Modrinth y CurseForge, además de Java, memoria y skins — todo en un solo lugar, sin anuncios.

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

> Los builds portables con búsqueda de CurseForge requieren la variable `CURSEFORGE_API_KEY` (o el secret del repo en CI) antes de compilar — genera el `curseforge-embedded.json` embebido vía `node scripts/obfuscate-curseforge-key.js`. Sin él, el build pide la key manualmente en Descubrir → CurseForge.

## Estado de lanzamiento

La versión declarada es `0.1.0-beta.1`. Antes de publicar, debe completarse [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md), incluida la validación en una instalación limpia, la firma de artefactos y la configuración del repositorio remoto. El changelog es local (`CHANGELOG.md` ignorado en git) — no se commitea.

### Publicar una actualización (control manual)

El auto-update es manual y más seguro: aunque subas una release a GitHub, **no se ofrece hasta que ejecutes `pnpm update-kindyr`**.

```bash
# Desde la carpeta del proyecto (importante):
cd KindyrLauncher
pnpm update-kindyr

# Si estás en otra carpeta, usa:
pnpm --dir <ruta-a>/KindyrLauncher update-kindyr
# o
node <ruta-a>/KindyrLauncher/scripts/update-kindyr.js

# También podés hacer doble click en update-kindyr.bat
```

El comando actualiza `update.json` (`approvedAt` nuevo) y habilita **un solo ciclo** 5s→3s→5s en todos los launchers. Sin ese comando, una release vulnerada subida a GitHub queda mitigada — no se descarga en silencio (nota: es una mitigación, no una prueba criptográfica; quien también pueda pushear `update.json` igual puede habilitar el ciclo).

## Reportar problemas

- Bugs e ideas: usá el portal del proyecto o [abrí un issue](https://github.com/iDontrixss/KindyrLauncher/issues).
- **Vulnerabilidades: nunca en un issue público.** Ver [SECURITY.es.md](docs/SECURITY.es.md) para los canales privados.

## Seguridad y privacidad

Consulta [SECURITY.es.md](docs/SECURITY.es.md), [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md) / [docs/legal/PRIVACY.en.md](docs/legal/PRIVACY.en.md).

## Legal

- Español: [Términos de uso](docs/legal/TERMINOS_DE_USO.md)
- English: [Terms of Use](docs/legal/TERMS_OF_USE.md)
- Español: [Política de privacidad](docs/legal/PRIVACY.md)
- English: [Privacy Policy](docs/legal/PRIVACY.en.md)
- [Avisos de terceros](THIRD_PARTY_NOTICES.es.md)
- [Licencia](LICENSE)

## Licencia

El código propio se distribuye bajo **GPL-3.0-or-later** — ver [LICENSE](LICENSE). Se puede usar, modificar y compartir el programa siempre que se mantenga la misma licencia y se comparta el código fuente.
