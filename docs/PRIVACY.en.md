# Privacy

Kindyr does not operate its own telemetry server and does not include usage analytics.

## Locally stored data

- Launcher and instance configuration.
- Favorites and visual preferences.
- Minecraft execution logs.
- Microsoft account data required to launch the game.

Microsoft credentials are encrypted with the operating system's secure storage. If Linux only offers the insecure `basic_text` backend, Kindyr refuses to store credentials. The launcher does not send tokens to the renderer.

## External services

Depending on the features used, Kindyr communicates directly with Microsoft/Xbox/Minecraft services for authentication, profiles, versions and skins; Modrinth for searching and downloading content; CurseForge for searching content; Adoptium for Java distributions; Mojang for game resources; and official loader repositories such as Fabric, Quilt, Forge and NeoForge, as well as GitHub for update checks and cdn.jsdelivr.net for the skin preview library (skinview3d) and mc-heads.net for avatar previews.

These services receive the normal technical information of a network connection, such as the IP address and user agent, and apply their own privacy policies.

## Data removal

Accounts can be removed from within the launcher. Uninstalling does not automatically delete user data to avoid losing instances. To delete it completely, remove the Kindyr data folder after closing the application.

