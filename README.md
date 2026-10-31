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

The declared version is `0.2.0-beta.2`. Before publishing, [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) must be completed, including clean-install validation, artifact signing and remote repository setup. The changelog is local (`CHANGELOG.md` ignored in git) — it is not committed.

### Publishing an update (signed)

The launcher **only offers an update whose manifest is signed** with your private key. Uploading or replacing a release on GitHub is not enough: without the signature, launchers ignore it.

```bash
# Once: generate the key pair (the private key stays outside the repo, encrypted)
pnpm release:keygen        # commit main/update-public-keys.js

# On every release, after building (pnpm build / pnpm build:linux):
pnpm release:sign          # creates dist/update-manifest.json and .sig
```

Upload to the GitHub release: the installer, `latest*.yml`, the `.blockmap` files, `update-manifest.json` and `update-manifest.json.sig`. The launcher verifies the signature with the embedded public key, requires a version newer than the installed one and checks that the installer hash (`latest.yml`) matches the signed one. Keep a backup of the private key and its passphrase outside GitHub; without it you cannot sign more versions. Details in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

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
