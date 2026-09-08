# Kindyr Launcher

> **[Español](README.es.md)** · Independent project. Not affiliated with Mojang Studios or Microsoft.

Kindyr is a desktop launcher for Minecraft built with Electron. Manage Microsoft accounts, instances, loaders and modpacks from Modrinth and CurseForge, plus Java, memory and skins — all in one place, with no ads.

## Dev requirements

- Node.js 24 LTS recommended; versions from 22.12 and below 26 are supported.
- **pnpm** (not npm).
- Linux or Windows.
- On Linux, a Secret Service or KWallet compatible keyring to store Microsoft credentials.

## Development

```bash
pnpm install
pnpm check:syntax
pnpm test
pnpm start
```

Electron 42 ships a separate installer. The project's `postinstall` runs it automatically when Electron is present and shows a clear error if the Node runtime is not compatible.

## Packaging

```bash
pnpm build:linux
pnpm build:win
```

Artifacts are created in `dist/`. Microsoft credentials are encrypted with the OS secure storage and never exposed to the renderer.

> Portable builds with CurseForge search require the `CURSEFORGE_API_KEY` env var (or repo secret in CI) before building — it generates the embedded `curseforge-embedded.json` via `node scripts/obfuscate-curseforge-key.js`. Without it, the build asks for a key manually inside Discover → CurseForge.

## Release status

The declared version is `0.1.0-beta.1`. Before publishing, [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) must be completed, including clean-install validation, artifact signing and remote repository setup. The changelog is local (`CHANGELOG.md` ignored in git) — it is not committed.

### Publishing an update (manual control)

Auto-update is manual and safer: even if you upload a release to GitHub, **it is not offered until you run `pnpm update-kindyr`**.

```bash
# From the project folder (important):
cd KindyrLauncher
pnpm update-kindyr

# From anywhere else, use:
pnpm --dir <path-to>/KindyrLauncher update-kindyr
# or
node <path-to>/KindyrLauncher/scripts/update-kindyr.js

# You can also double click update-kindyr.bat
```

The command updates `update.json` (new `approvedAt`) and enables **a single** 5s→3s→5s check cycle on all launchers. Without that command, a compromised release uploaded to GitHub is mitigated — it will not be silently downloaded (note: this is a mitigation, not cryptographic proof; whoever can also push `update.json` can still enable the cycle).

## Reporting issues

- Bugs and ideas: use the project portal or [open an issue](https://github.com/iDontrixss/KindyrLauncher/issues).
- **Vulnerabilities: never in a public issue.** See [SECURITY.md](docs/SECURITY.md) for private reporting channels.

## Security and privacy

See [SECURITY.md](docs/SECURITY.md), [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md) / [docs/legal/PRIVACY.en.md](docs/legal/PRIVACY.en.md).

## Legal

- Español: [Términos de uso](docs/legal/TERMINOS_DE_USO.md)
- English: [Terms of Use](docs/legal/TERMS_OF_USE.md)
- Español: [Política de privacidad](docs/legal/PRIVACY.md)
- English: [Privacy Policy](docs/legal/PRIVACY.en.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [License](LICENSE)

## License

Our own code is distributed under **GPL-3.0-or-later** — see [LICENSE](LICENSE). You may use, modify and share the program as long as you keep the same license and provide the source code.
