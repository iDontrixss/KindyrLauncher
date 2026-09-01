# Privacidad

Kindyr no opera un servidor propio de telemetría y no incluye analítica de uso.

## Datos almacenados localmente

- Configuración del launcher e instancias.
- Favoritos y preferencias visuales.
- Registros de ejecución de Minecraft.
- Datos de cuentas Microsoft necesarios para iniciar el juego.

Las credenciales Microsoft se cifran con el almacén seguro del sistema operativo. Si Linux solo ofrece el backend inseguro `basic_text`, Kindyr rechaza guardar las credenciales. El launcher no envía tokens al renderer.

## Servicios externos

Según las funciones utilizadas, Kindyr se comunica directamente con servicios de Microsoft/Xbox/Minecraft para autenticación, perfiles, versiones y skins; Modrinth para buscar y descargar contenido; Mojang para recursos del juego; y repositorios oficiales de loaders como Fabric, Quilt, Forge y NeoForge.

Esos servicios reciben la información técnica normal de una conexión de red, como la dirección IP y el agente de usuario, y aplican sus propias políticas de privacidad.

## Eliminación de datos

Las cuentas pueden quitarse desde el launcher. La desinstalación no elimina automáticamente los datos de usuario para evitar perder instancias. Quien desee eliminarlos por completo debe borrar la carpeta de datos de Kindyr después de cerrar la aplicación.
