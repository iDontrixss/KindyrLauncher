# Privacy

Kindyr does not operate its own telemetry server and does not include usage analytics. No data is sent to Kindyr/Loryq servers.

## Locally stored data

Everything is stored in the user data folder (`getKindyrDataRoot()` — `%APPDATA%/KindyrLauncher` on Windows, `~/.config/KindyrLauncher` on Linux, `~/Library/Application Support/KindyrLauncher` on macOS):

- **Launcher configuration** (`settings.json`): language, theme, account type, offline username, custom Java installs (`javaInstalls`), concurrent download limit, custom background (`background.mp4`), onboarding flag (`onboarding-done.json`) and previous version (`previous-version.json`).
- **Instances** (`instances.json` + `instances/<id>/`): list of instances, Minecraft version, loader and files for each instance.
- **Microsoft accounts** (`ms-accounts.json`): list of accounts with tokens. **Encrypted with system `safeStorage`** (Keychain on macOS, Credential Manager on Windows, Secret Service/KWallet on Linux). If Linux only offers the insecure `basic_text` backend, Kindyr refuses to save and shows an error. The renderer never receives tokens (`account-storage.js` sanitizes).
- **CurseForge key** (`curseforge.key`): if manually configured, stored **encrypted with `safeStorage`**; if using the embedded obfuscated key, it is not written to disk (only decrypted in RAM when entering Discover → CurseForge).
- **Cache and runtime**: `cache/`, `storage-cache.json`, `runtime/java-*` (Adoptium Java) and Minecraft execution logs. No personal data.

None of these files are sent to Kindyr; they are only read/written locally. The launcher does not send tokens to the renderer.

## External services

Depending on the features used, Kindyr communicates directly with Microsoft/Xbox/Minecraft services for authentication, profiles, versions and skins; Modrinth for searching and downloading content; CurseForge for searching content; Adoptium for Java distributions; Mojang for game resources; and official loader repositories such as Fabric, Quilt, Forge and NeoForge, as well as GitHub for update checks and cdn.jsdelivr.net for the skin preview library (skinview3d) and mc-heads.net for avatar previews.

These services receive the normal technical information of a network connection, such as the IP address and user agent, and apply their own privacy policies.

## Data removal

Accounts can be removed from within the launcher. Uninstalling does not automatically delete user data to avoid losing instances. To delete it completely, remove the Kindyr data folder after closing the application.

