# Privacidad

Kindyr no opera un servidor propio de telemetría y no incluye analítica de uso. No se envía información a servidores de Kindyr/Loryq.

## Datos almacenados localmente

Todo se guarda en la carpeta de datos del usuario (`getKindyrDataRoot()` — `%APPDATA%/KindyrLauncher` en Windows, `~/.config/KindyrLauncher` en Linux, `~/Library/Application Support/KindyrLauncher` en macOS):

- **Configuración del launcher** (`settings.json`): idioma, tema, tipo de cuenta, nombre de usuario offline, instalaciones Java personalizadas (`javaInstalls`), límite de descargas concurrentes, fondo personalizado (`background.mp4`), marca de onboarding (`onboarding-done.json`) y versión previa (`previous-version.json`).
- **Instancias** (`instances.json` + `instances/<id>/`): lista de instancias, versión de Minecraft, loader y archivos de cada instancia.
- **Cuentas Microsoft** (`ms-accounts.json`): lista de cuentas con tokens. **Cifrado con `safeStorage` del sistema** (Keychain en macOS, Credential Manager en Windows, Secret Service/KWallet en Linux). Si Linux solo ofrece el backend inseguro `basic_text`, Kindyr rechaza guardar y muestra error. El renderer nunca recibe tokens (`account-storage.js` sanitiza).
- **Clave CurseForge** (`curseforge.key`): si el usuario la configura manualmente, se guarda **cifrada con `safeStorage`**; si usa la clave embebida ofuscada, no se escribe a disco (solo se descifra en RAM al entrar a Descubrir → CurseForge).
- **Caché y runtime** (`cache/`, `storage-cache.json`, `runtime/java-*`) y registros de ejecución del launcher/Minecraft. Estos archivos pueden contener información técnica y, según la operación realizada, pueden incluir nombres de usuario, rutas locales, direcciones de servidores, argumentos JVM u otra información de diagnóstico. Se almacenan localmente y no se envían a Kindyr.

Ninguno de estos archivos se envía a Kindyr; solo se leen/escriben localmente. El launcher no envía tokens al renderer.

## Servicios externos

Según las funciones utilizadas, Kindyr se comunica directamente con servicios de Microsoft/Xbox/Minecraft para autenticación, perfiles, versiones y skins; Modrinth y CurseForge para buscar, recuperar y descargar contenido disponible; Adoptium para distribuciones de Java; Mojang para recursos del juego; repositorios oficiales de loaders como Fabric, Quilt, Forge y NeoForge; GitHub para comprobar actualizaciones; y servicios complementarios como cdn.jsdelivr.net para la librería de previsualización de skins (skinview3d) y mc-heads.net para avatares.

Estos servicios reciben la información técnica normalmente necesaria para una conexión de red, como la dirección IP y el agente de usuario. Según la función utilizada, también pueden transmitirse datos adicionales, como consultas de búsqueda, identificadores de contenido solicitado, tokens de autenticación, información de cuenta o perfil, datos de skins u otra información necesaria para realizar la operación solicitada.

Kindyr no envía esta información a servidores propios. El servicio de terceros correspondiente la recibe directamente del launcher y la procesa según sus propios términos y políticas de privacidad.

## Eliminación de datos

Las cuentas pueden quitarse desde el launcher. La desinstalación no elimina automáticamente los datos de usuario para evitar perder instancias. Quien desee eliminarlos por completo debe borrar la carpeta de datos de Kindyr después de cerrar la aplicación.
