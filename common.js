// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

let selectedVersion = '1.21.4'
let selectedInstance = 'vanilla-1.21.4'
const JAVA_MAJORS_UI = [25, 21, 17, 8]

const I18N = {
  es: {
    'settings.kicker': 'CENTRO DE CONTROL',
    'settings.title': 'Ajustes',
    'settings.subtitle': 'Personalizá el launcher y los valores predeterminados.',
    'settings.reset': 'Restaurar',
    'settings.save': 'Guardar',
    'settings.tab.personalization': 'Personalización',
    'settings.tab.general': 'General',
    'settings.tab.resources': 'Recursos',
    'settings.language': 'Idioma',
    'settings.theme': 'Tema',
    'settings.theme.dark': 'Oscuro',
    'settings.theme.light': 'Claro',
    'settings.theme.kindyr': 'Kindyr',
    'settings.theme.midnight': 'Midnight',
    'settings.theme.navy': 'Navy',
    'settings.theme.azure': 'Azure',
    'settings.theme.steel': 'Steel',
    'settings.background': 'Fondo personalizado',
    'settings.background.desc': 'Imagen de fondo del área principal del launcher.',
    'settings.background.pick': 'Elegir imagen',
    'settings.background.clear': 'Quitar fondo',
    'settings.background.processing': 'Procesando fondo...',
'settings.background.applied': 'Fondo aplicado',
'settings.background.error': 'Error al aplicar el fondo',
    'settings.defaults.ram': 'RAM predeterminada',
    'settings.defaults.ram.desc': 'Se usa al iniciar Minecraft si no cambiás la memoria manualmente.',
    'settings.ram.min': 'Mínima',
    'settings.ram.max': 'Máxima',
    'settings.javaArgs': 'Argumentos JVM',
    'settings.javaArgs.desc': 'Argumentos extra para Java al iniciar Minecraft. Separados por espacio.',
    'settings.java.title': 'Instalaciones de Java',
    'settings.java.desc': 'Rutas por versión. Vacío = descarga automática de Temurin al jugar.',
    'settings.dataRoot': 'Carpeta de datos',
    'settings.dataRoot.desc': 'Instancias, Java descargado y archivos del launcher.',
    'settings.storage': 'Uso de almacenamiento',
    'settings.storage.total': 'Total',
    'settings.storage.instances': 'Instancias',
    'settings.storage.runtime': 'Java (runtime)',
    'settings.storage.cache': 'Caché',
    'settings.storage.refresh': 'Actualizar',
    'settings.downloads': 'Descargas',
    'settings.downloads.max': 'Descargas simultáneas',
    'settings.downloads.max.desc': 'Cuántos archivos puede descargar el launcher a la vez.',
    'settings.cache.title': 'Caché del launcher',
    'settings.cache.desc': 'Borra metadatos en caché y archivos temporales de descarga de Java.',
    'settings.cache.purge': 'Vaciar caché',
    'settings.beta.title': 'Funciones beta',
    'settings.beta.desc': 'Funciones experimentales que pueden cambiar en futuras versiones.',
    'settings.beta.eager': 'Preparar instancias al crear',
    'settings.beta.eager.desc': 'Descarga Java y Minecraft al crear la instancia. El primer inicio será instantáneo. Usa más espacio y red al crear.',
    'settings.beta.enabled': 'Activado',
    'settings.beta.disabled': 'Desactivado',
    'settings.beta.preparing': 'Preparando {name}…',
    'settings.beta.prepared': 'Instancia lista: {name}',
    'settings.beta.failed': 'No se pudo preparar {name}',
    'instance.preparing': 'Preparando…',
    'instance.ready': 'Lista',
    'nav.home': 'Inicio',
    'nav.instances': 'Instancias',
    'nav.discover': 'Descubrir',
    'nav.skins': 'Skins',
    'nav.settings': 'Ajustes',
    'home.recent': 'Instancias recientes',
    'home.allInstances': 'Ver todas las instancias',
    'home.recommended': 'Recomendado',
    'home.status': 'Estado',
    'home.ready': 'Listo',
    'home.quickActions': 'Acciones rápidas',
    'home.recentLabel': 'Recientes',
    'home.instanceUnit': 'instancia',
    'home.instancesUnit': 'instancias',
    'home.accountStatus': 'Cuenta: {name}',
    'home.action.new': 'Nueva instancia',
    'home.action.new.desc': 'Crea un perfil desde cero',
    'home.action.discover': 'Explorar contenido',
    'home.action.discover.desc': 'Busca mods y modpacks',
    'home.action.skins': 'Cambiar skin',
    'home.action.skins.desc': 'Gestiona tu apariencia',
    'home.action.settings': 'Ajustar launcher',
    'home.action.settings.desc': 'Java, memoria y apariencia',
    'home.action.import.desc': 'Desde un archivo .mrpack',
    'instance.exportMrpack': 'Exportar como .mrpack',
'instance.exporting': 'Exportando modpack...',
'instance.exportSuccess': 'Exportado: {name}',
'instance.exportError': 'Error al exportar',
'instance.showMore': 'Ver más',
'instance.showLess': 'Ver menos',
    'home.subtitle': 'Elegí una instalación reciente para gestionarla, instalar mods y jugar.',
    'home.empty': 'Todavía no hay instancias recientes. Elegí una en Instancias o pulsá Jugar.',
    'java.installRecommended': 'Instalar recomendado',
    'java.detect': 'Detectar',
    'java.browse': 'Examinar',
    'java.location': 'Java {major} location',
    'discover.title': 'Descubrir',
    'discover.subtitle': 'Explorá proyectos reales publicados en Modrinth.',
    'discover.api.live': 'API EN VIVO',
    'discover.filters': 'Filtros',
    'discover.reset': 'Restablecer',
    'discover.projectType': 'Tipo de proyecto',
    'discover.minecraftVersion': 'Versión de Minecraft',
    'discover.anyVersion': 'Todas las versiones',
    'discover.loader': 'Loader',
    'discover.anyLoader': 'Cualquier loader',
    'discover.autoLoader': 'Automático compatible',
    'discover.sortBy': 'Ordenar por',
    'discover.pageSize': 'Resultados por página',
    'discover.source.live': 'Datos en vivo',
    'discover.context.label': 'Instalación directa',
    'discover.context.note': 'Cada instalación irá directamente a esta instancia, sin menús intermedios.',
    'discover.context.back': 'Volver a la instancia',
    'discover.installDirect': 'Instalar aquí',
    'discover.installingDirect': 'Instalando...',
    'discover.installDirectError': 'No se pudo instalar el proyecto en esta instancia.',
    'discover.installedDirect': 'Instalación completada',
    'discover.installedDirectMessage': '{project} ({version}) se instaló en {instance}.',
    'discover.search': 'Buscar en Modrinth...',
    'discover.version': 'Versión, ej: 1.21.4',
    'discover.relevance': 'Relevancia',
    'discover.downloads': 'Descargas',
    'discover.followers': 'Seguidores',
    'discover.updated': 'Actualizados',
    'discover.newest': 'Nuevos',
    'discover.search.btn': 'Buscar',
    'discover.ready': 'Listo para buscar mods y contenido.',
    'discover.loading': 'Buscando en Modrinth...',
    'discover.error': 'Error en Modrinth',
    'discover.prev': 'Anterior',
    'discover.next': 'Siguiente',
    'discover.type.all': 'Todo',
    'discover.type.mod': 'Mods',
    'discover.type.modpack': 'Modpacks',
    'discover.type.resourcepack': 'Resource packs',
    'discover.type.shader': 'Shaderpacks',
    'discover.type.datapack': 'Datapacks',
    'discover.type.plugin': 'Plugins',
    'discover.type.modSingle': 'Mod',
    'discover.type.modpackSingle': 'Modpack',
    'discover.type.resourcepackSingle': 'Resource pack',
    'discover.type.shaderSingle': 'Shader',
    'discover.project': 'Proyecto',
    'discover.by': 'por {author}',
    'discover.install': 'Instalar',
    'discover.view': 'Ver',
    'instances.title': 'Instancias',
    'instances.subtitle': 'Elegí un perfil de juego para usar.',
    'instances.summary.total': 'Total',
    'instances.summary.modded': 'Con loader',
    'instances.summary.visible': 'Visibles',
    'instances.library.label': 'Biblioteca',
    'instances.library.title': 'Tus instalaciones',
    'instances.empty': 'Todavía no hay instalaciones. Creá una para empezar.',
    'instances.search': 'Buscar instancia...',
    'instances.add': 'Agregar instalación',
'instances.import': 'Importar modpack',
'instances.importing': 'Importando...',
'instances.importSuccess': 'Modpack importado: {name}',
'instances.importError': 'Error al importar el modpack',
'instances.importInvalid': 'Archivo .mrpack inválido',
    'instances.open': 'Abrir',
    'instances.current': 'Actual',
    'account.title': 'Gestor de cuentas',
    'account.offline': 'Cuenta offline actual',
    'account.none': 'Sin cuenta',
    'account.ms.section': 'Cuentas Microsoft',
    'account.offline.section': 'Cuentas offline',
    'account.add': 'Agregar',
    'account.placeholder': 'Nuevo nombre offline',
    'account.ms.login': 'Iniciar sesión con Microsoft',
    'account.ms.opening': 'Abriendo Microsoft...',
    'account.ms.waiting': 'Esperando login...',
    'account.ms.none': 'No hay cuentas Microsoft agregadas.',
    'account.ms.premium': 'Microsoft · Premium',
    'account.ms.active': '· Activa',
    'account.offline.active': '· Activa',
    'confirm.delete.account': '¿Eliminar la cuenta "{name}"? Esta acción no se puede deshacer.',
    'confirm.logout.ms': '¿Cerrar sesión con esta cuenta Microsoft? Tendrás que volver a iniciar sesión para usarla.',
    'confirm.delete': 'Eliminar',
    'confirm.cancel': 'Cancelar',
    'confirm.title': 'Confirmar',
    'app.ready': 'Listo para jugar',
    'app.launchError': 'Error al iniciar Minecraft',
    'app.minecraftStarting': 'Minecraft arrancando...',
    'app.playing': 'Jugando...',
    'app.downloadingFiles': 'Descargando archivos...',
    'app.close': 'Cerrar',
    'app.window.minimize': 'Minimizar ventana',
    'app.window.maximize': 'Maximizar ventana',
    'app.window.close': 'Cerrar ventana',
    'sidebar.collapse': 'Contraer barra lateral',
    'sidebar.expand': 'Expandir barra lateral',
    'nav.main': 'Navegación principal',
    'account.open': 'Abrir gestor de cuentas',
    'account.mode.offline': 'Modo offline',
    'account.mode.microsoft': 'Cuenta Microsoft',
    'account.ms.premiumStatus': 'Cuenta Microsoft · Premium',
    'account.none.offline': 'No hay cuentas offline.',
    'account.delete': 'Eliminar cuenta',
    'account.selected': 'Cuenta seleccionada: {name}',
    'account.name.required': 'Escribí un nombre',
    'account.name.invalid': 'Nombre inválido: usa 3-16 letras, números o _',
    'account.exists': 'Ya existe una cuenta con ese nombre',
    'account.added': 'Cuenta offline agregada: {name}',
    'account.added.microsoft': '¡Cuenta agregada: {name}!',
    'account.logout': 'Cerrar sesión',
    'time.now': 'Ahora',
    'time.minutes': 'Hace {count} min',
    'time.hours': 'Hace {count} h',
    'time.days': 'Hace {count} días',
    'time.weeks': 'Hace {count} semanas',
    'time.months': 'Hace {count} meses',
    'instance.label': 'Instalación',
    'instance.title.fallback': 'Instancia',
    'instance.isolatedFolder': 'carpeta aislada',
    'instance.controlCenter': 'Centro de control',
    'instance.managerHint': 'Gestioná contenido, archivos, mundos y registros.',
    'instance.loaderLabel': 'Loader',
    'instance.versionLabel': 'Versión',
    'instance.modsCount': 'Mods',
    'instance.worldsCount': 'Mundos',
    'instance.quickFolders': 'Accesos rápidos',
    'instance.play': 'Jugar',
    'instance.refresh': 'Refrescar',
    'instance.discover': 'Descubrir',
    'instance.content': 'Contenido',
    'instance.folders': 'Carpetas',
    'instance.worlds': 'Mundos',
    'instance.logs': 'Logs',
    'instance.openFolder': 'Abrir carpeta',
    'instance.openInstanceFolder': 'Abrir carpeta de la instancia',
    'instance.openMods': 'Abrir mods',
    'instance.minecraftLogs': 'Logs de Minecraft',
    'instance.launcherLogs': 'Logs del launcher',
    'instance.console': 'Consola de inicio',
    'instance.clear': 'Limpiar',
    'instance.selectedStatus': 'Instancia: {name}',
    'instance.folderOpened': 'Carpeta de instancia abierta',
    'instance.folderOpen': 'Carpeta abierta',
    'instance.modUpdated': 'Mod actualizado',
    'instance.emptyMods': 'No hay mods en esta instancia todavía',
    'instance.emptyWorlds': 'No hay mundos guardados en esta instancia',
    'instance.emptyLogs': 'Todavía no hay logs para mostrar',
    'instance.active': 'Activo',
    'instance.disabled': 'Desactivado',
    'instance.enable': 'Activar',
    'instance.disable': 'Desactivar',
    'instance.updatedAt': 'Actualizado: {date}',
    'instance.world': 'Mundo',
    'instance.folder.root': 'Instancia',
    'instance.folder.saves': 'Mundos',
    'instances.use': 'Usar',
    'instances.lastSelected': 'Última seleccionada',
    'instances.stable': 'Estable',
    'instances.modFriendly': 'Compatible con muchos mods',
    'instances.oldModpacks': 'Buena para modpacks viejos',
    'discover.loaded': 'Resultados cargados',
    'discover.noResults': 'No encontré nada. Probá con otra búsqueda.',
    'discover.loadingResults': 'Cargando resultados...',
    'discover.searchFailed': 'No se pudo buscar en Modrinth.',
    'discover.openingProject': 'Abriendo proyecto en Modrinth',
    'discover.noDescription': 'Sin descripción.',
    'discover.resultsSummary': '{start}-{end} de {total} resultados',
    'discover.pageSummary': 'Página {page} de {pages}',
    'home.title': 'Inicio',
    'home.optimized.title': 'Crear instalación optimizada',
    'home.optimized.loading': 'Keo Optimized · cargando desde Modrinth...',
    'home.optimized.meta': 'Keo Optimized · por {creator} · {downloads} descargas',
    'home.optimized.fallbackDesc': 'Pack de optimización para mejorar FPS y mantener una experiencia vanilla.',
    'home.optimized.versionUnknown': 'Última',
    'home.optimized.loadError': 'No se pudo cargar Keo Optimized desde Modrinth.',
    'home.optimized.notFound': 'No encontré Keo Optimized en Modrinth.',
    'home.search.mods': 'Buscar mods...',
    'home.search.resourcepacks': 'Buscar resource packs...',
    'home.search.datapacks': 'Buscar data packs...',
    'home.search.shaders': 'Buscar shaders...',
    'home.search.content': 'Buscar contenido...',
    'home.sort.label': 'Ordenar por',
    'home.sort.relevance': 'Ordenar por: Relevancia',
    'home.sort.downloads': 'Ordenar por: Descargas',
    'home.sort.followers': 'Ordenar por: Seguidores',
    'home.sort.updated': 'Ordenar por: Actualizados',
    'home.sort.newest': 'Ordenar por: Nuevos',
    'home.limit.label': 'Resultados por página',
    'home.limit': 'Ver: {count}',
    'home.prevPage': 'Página anterior',
    'home.nextPage': 'Página siguiente',
    'home.noCompatible': 'No hay contenido compatible con esta instalación.',
    'home.loadingContent': 'Cargando contenido...',
    'home.searchFailed': 'No se pudo buscar contenido.',
    'home.loadedFor': '{type} para {version} cargados',
    'home.vanillaModsWarning': 'Esta instalación es vanilla. Creá una con Fabric, Forge o similar para instalar mods.',
    'home.installing': 'Instalando...',
    'home.installingRelease': 'Instalando release estable de {title}',
    'home.installed': 'Instalado: {name}',
    'install.title': 'Instalar contenido',
    'install.titleProject': 'Instalar {title}',
    'install.any': 'Cualquiera',
    'install.destination': 'Destino',
    'install.destination.downloads': 'PC - Carpeta Descargas',
    'install.destination.instance': 'Instalación del launcher',
    'install.destination.newInstance': 'Nueva instancia',
    'install.destination.downloadsShort': 'Carpeta Descargas',
    'install.instance': 'Instalación',
    'install.compatibleVersions': 'Versiones compatibles',
    'install.versions': 'Versiones',
    'install.note': 'Elegí versión, loader y destino.',
    'install.cancel': 'Cancelar',
    'install.install': 'Instalar',
    'install.download': 'Descargar',
    'install.downloading': 'Descargando...',
    'install.installing': 'Instalando...',
    'install.loadingVersions': 'Cargando versiones...',
    'install.loadingModpackVersions': 'Cargando versiones del modpack...',
    'install.searchingCompatible': 'Buscando versiones compatibles...',
    'install.checkingCompatibility': 'Revisando compatibilidad...',
    'install.noModpackVersions': 'No hay versiones disponibles para este modpack.',
    'install.noCompatible': 'No hay versiones compatibles con esa combinación.',
    'install.noCompatibleNote': 'No compatible con esa versión/loader.',
    'install.noLoaders': 'Esta versión no indica loaders compatibles.',
    'install.noVersions': 'Sin versiones compatibles.',
    'install.availableVersions': '{count} versión(es) disponibles.',
    'install.compatibleFound': '{count} versión(es) compatibles encontradas.',
    'install.pickVersion': 'Elegí una versión compatible primero',
    'install.working': 'Trabajando... si es modpack puede tardar un toque.',
    'install.done': 'Listo: {path}',
    'install.downloaded': 'Descargado en Descargas',
    'install.installedLauncher': 'Instalado en el launcher',
    'create.title': '+ Nueva instalación',
    'create.snapshots': 'Mostrar snapshots · versiones de prueba',
    'create.minecraftVersion': 'Versión de Minecraft',
    'create.searchVersion': 'Buscar versión...',
    'create.note': 'Elegí loader y versión.',
    'create.create': 'Crear instalación',
    'create.loadingVersions': 'Cargando versiones...',
    'create.compatibleVersions': '{count} versiones compatibles.',
    'create.pickVersion': 'Elegí una versión primero',
    'create.created': 'Instalación creada: {name}',
    'create.creating': 'Creando...',
    'settings.java.auto': 'Automático',
    'settings.java.none': 'Sin Java',
    'settings.java.unknown': 'Desconocido',
    'settings.java.loadError': 'Error al cargar instalaciones de Java: {error}',
    'settings.java.renderError': 'Error al renderizar instalaciones de Java',
    'settings.java.saveError': 'Error al guardar ruta de Java',
    'settings.java.browseError': 'Error al buscar ruta de Java',
    'settings.java.detected': 'Java {major} detectado',
    'settings.java.detectError': 'Error al detectar Java',
    'settings.java.downloading': 'Descargando Java {major}...',
    'settings.java.installed': 'Java {major} instalado',
    'settings.java.installError': 'Error al instalar Java',
    'settings.dataRoot.openError': 'Error al abrir carpeta de datos',
    'settings.cache.purgeFailed': 'No se pudo vaciar la caché',
    'settings.cache.purgeError': 'Error al vaciar caché',
    'settings.background.loadFailed': 'No se pudo cargar la imagen',
    'settings.background.pickError': 'Error al elegir imagen de fondo',
    'settings.background.clearError': 'Error al quitar imagen de fondo',
    'settings.validation.username': 'Nombre offline inválido: usa 3-16 letras, números o _',
    'settings.validation.ram': 'RAM inválida: usa algo como 2048, 4096M o 4G',
    'settings.validation.ramOrder': 'La RAM mínima no puede ser mayor que la máxima',
    'settings.validation.error': 'Error al validar ajustes',
    'settings.saveError': 'Error al guardar ajustes',
    'settings.resetError': 'Error al restaurar ajustes',
    'skins.apply': 'Aplicar skin',
    'skins.kicker': 'IDENTIDAD DEL JUGADOR',
    'skins.title': 'Skins',
    'skins.subtitle': 'Buscá, previsualizá y guardá tu próxima apariencia.',
    'skins.upload': 'Subir skin',
    'skins.saveFavorite': 'Guardar favorita',
    'skins.popular': 'Populares',
    'skins.favorites': 'Favoritas',
    'skins.uploadTab': 'Subir',
    'skins.featured': 'Jugadores destacados',
    'skins.loading': 'Cargando jugadores...',
    'skins.searching': 'Buscando "{q}"...',
    'skins.searchResult': 'Resultado — {name}',
    'skins.searchNotFound': 'No se encontró el usuario <strong>"{q}"</strong>.<br>Verificá que el nombre sea exacto.',
    'skins.sourcePopular': 'POPULAR',
    'skins.sourceSearch': 'BÚSQUEDA',
    'skins.sourceFavorite': 'FAVORITA',
    'skins.sourceUpload': 'PROPIA',
    'skins.sourceEquipped': 'EQUIPADA',
    'skins.equipped': 'Skin equipada — tu skin premium actual',
    'skins.modelClassic': 'CLASSIC',
    'skins.modelSlim': 'SLIM',
    'skins.view2dActive': '✓ Vista 2D activa',
    'skins.skinLoaded': '✓ Skin cargada',
    'skins.skinLoadError': '❌ Error al cargar skin',
    'skins.viewerNotInitialized': '❌ Viewer no inicializado',
    'skins.skinApplied': '✓ Skin aplicada. Se verá en el juego.',
    'skins.skinSavedLocal': '✓ Guardada localmente (solo visible para vos).',
    'skins.tryAgain': 'intentá de nuevo',
    'skins.applying': 'Aplicando...',
    'skins.favoriteSaved': '★ Guardada en favoritas',
    'skins.noFavorites': 'No tenés skins favoritas todavía.<br>Marcá una skin con ★ para guardarla acá.',
    'skins.myFavorites': 'Mis favoritas ({count})',
    'skins.dragDrop': 'Arrastrá tu skin aquí',
    'skins.orClick': 'o hacé click para seleccionar un archivo<br>',
    'skins.fileSpec': '<span style="font-size:11px;color:#555">PNG · 64×64 o 64×32 px</span>',
    'skins.pngOnly': 'Solo se aceptan archivos .png',
    'skins.previewReady': '✓ Preview lista. Hacé click en "Aplicar skin".',
    'skins.selectSkin': 'Seleccioná una skin para comenzar',
    'skins.webglUnavailable': '⚠️ WebGL no disponible. Usando vista 2D.',
    'skins.skinview3dUnavailable': '⚠️ skinview3d no disponible. Usando vista 2D.',
    'skins.error3d': '⚠️ Error 3D. Usando vista 2D.',
    'skins.skinview3dLoadError': '❌ Error: No se pudo cargar el visor 3D. Revisá tu conexión.'
  },
  en: {
    'settings.kicker': 'CONTROL CENTER',
    'settings.title': 'Settings',
    'settings.subtitle': 'Customize the launcher and default values.',
    'settings.reset': 'Reset',
    'settings.save': 'Save',
    'settings.tab.personalization': 'Personalization',
    'settings.tab.general': 'General',
    'settings.tab.resources': 'Resources',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.theme.dark': 'Dark',
    'settings.theme.light': 'Light',
    'settings.theme.kindyr': 'Kindyr',
    'settings.theme.midnight': 'Midnight',
    'settings.theme.navy': 'Navy',
    'settings.theme.azure': 'Azure',
    'settings.theme.steel': 'Steel',
    'settings.background': 'Custom background',
    'settings.background.desc': 'Background image for the main launcher area.',
    'settings.background.pick': 'Choose image/Video',
    'settings.background.clear': 'Remove background',
    'settings.background.processing': 'Processing background...',
'settings.background.applied': 'Background applied',
'settings.background.error': 'Error applying background',
    'settings.defaults.ram': 'Default RAM',
    'settings.defaults.ram.desc': 'Used when launching Minecraft unless changed manually.',
    'settings.ram.min': 'Minimum',
    'settings.ram.max': 'Maximum',
    'settings.javaArgs': 'JVM arguments',
    'settings.javaArgs.desc': 'Extra Java arguments when launching Minecraft. Space separated.',
    'settings.java.title': 'Java installations',
    'settings.java.desc': 'Paths per version. Empty = automatic Temurin download when playing.',
    'settings.dataRoot': 'Data folder',
    'settings.dataRoot.desc': 'Instances, downloaded Java and launcher files.',
    'settings.storage': 'Storage usage',
    'settings.storage.total': 'Total',
    'settings.storage.instances': 'Instances',
    'settings.storage.runtime': 'Java (runtime)',
    'settings.storage.cache': 'Cache',
    'settings.storage.refresh': 'Refresh',
    'instance.exportMrpack': 'Export as .mrpack',
'instance.exporting': 'Exporting modpack...',
'instance.exportSuccess': 'Exported: {name}',
'instance.exportError': 'Error exporting',
'instance.showMore': 'Show more',
'instance.showLess': 'Show less',
    'settings.downloads': 'Downloads',
    'settings.downloads.max': 'Concurrent downloads',
    'settings.downloads.max.desc': 'How many files the launcher can download at once.',
    'settings.cache.title': 'Launcher cache',
    'settings.cache.desc': 'Clears cached metadata and temporary Java download files.',
    'settings.cache.purge': 'Purge cache',
    'settings.beta.title': 'Beta features',
    'settings.beta.desc': 'Experimental features that may change in future versions.',
    'settings.beta.eager': 'Prepare instances on create',
    'settings.beta.eager.desc': 'Download Java and Minecraft when creating the instance. First launch will be instant. Uses more space and network at creation.',
    'settings.beta.enabled': 'Enabled',
    'settings.beta.disabled': 'Disabled',
    'settings.beta.preparing': 'Preparing {name}…',
    'settings.beta.prepared': 'Instance ready: {name}',
    'settings.beta.failed': 'Could not prepare {name}',
    'instance.preparing': 'Preparing…',
    'instance.ready': 'Ready',
    'nav.home': 'Home',
    'nav.instances': 'Instances',
    'nav.discover': 'Discover',
    'nav.skins': 'Skins',
    'nav.settings': 'Settings',
    'home.recent': 'Recent instances',
    'home.allInstances': 'View all instances',
    'home.recommended': 'Recommended',
    'home.status': 'Status',
    'home.ready': 'Ready',
    'home.quickActions': 'Quick actions',
    'home.recentLabel': 'Recent',
    'home.instanceUnit': 'instance',
    'home.instancesUnit': 'instances',
    'home.accountStatus': 'Account: {name}',
    'home.action.new': 'New instance',
    'home.action.new.desc': 'Create a profile from scratch',
    'home.action.discover': 'Explore content',
    'home.action.discover.desc': 'Find mods and modpacks',
    'home.action.skins': 'Change skin',
    'home.action.skins.desc': 'Manage your appearance',
    'home.action.settings': 'Launcher settings',
    'home.action.settings.desc': 'Java, memory and appearance',
    'home.action.import.desc': 'From an .mrpack file',
    'home.subtitle': 'Choose a recent installation to manage, install mods and play.',
    'home.empty': 'No recent instances yet. Choose one in Instances or press Play.',
    'java.installRecommended': 'Install recommended',
    'java.detect': 'Detect',
    'java.browse': 'Browse',
    'java.location': 'Java {major} location',
    'discover.title': 'Discover',
    'discover.subtitle': 'Explore real projects published on Modrinth.',
    'discover.api.live': 'LIVE API',
    'discover.filters': 'Filters',
    'discover.reset': 'Reset',
    'discover.projectType': 'Project type',
    'discover.minecraftVersion': 'Minecraft version',
    'discover.anyVersion': 'All versions',
    'discover.loader': 'Loader',
    'discover.anyLoader': 'Any loader',
    'discover.autoLoader': 'Automatic compatible loader',
    'discover.sortBy': 'Sort by',
    'discover.pageSize': 'Results per page',
    'discover.source.live': 'Live data',
    'discover.context.label': 'Direct installation',
    'discover.context.note': 'Every installation goes straight to this instance, without intermediate menus.',
    'discover.context.back': 'Back to instance',
    'discover.installDirect': 'Install here',
    'discover.installingDirect': 'Installing...',
    'discover.installDirectError': 'Could not install the project into this instance.',
    'discover.installedDirect': 'Installation complete',
    'discover.installedDirectMessage': '{project} ({version}) was installed in {instance}.',
    'discover.search': 'Search on Modrinth...',
    'discover.version': 'Version, e.g: 1.21.4',
    'discover.relevance': 'Relevance',
    'discover.downloads': 'Downloads',
    'discover.followers': 'Followers',
    'discover.updated': 'Updated',
    'discover.newest': 'Newest',
    'discover.search.btn': 'Search',
    'discover.ready': 'Ready to search mods and content.',
    'discover.loading': 'Searching on Modrinth...',
    'discover.error': 'Modrinth error',
    'discover.prev': 'Previous',
    'discover.next': 'Next',
    'discover.type.all': 'All',
    'discover.type.mod': 'Mods',
    'discover.type.modpack': 'Modpacks',
    'discover.type.resourcepack': 'Resource packs',
    'discover.type.shader': 'Shaderpacks',
    'discover.type.datapack': 'Datapacks',
    'discover.type.plugin': 'Plugins',
    'discover.type.modSingle': 'Mod',
    'discover.type.modpackSingle': 'Modpack',
    'discover.type.resourcepackSingle': 'Resource pack',
    'discover.type.shaderSingle': 'Shader',
    'discover.project': 'Project',
    'discover.by': 'by {author}',
    'discover.install': 'Install',
    'discover.view': 'View',
    'instances.title': 'Instances',
    'instances.subtitle': 'Choose a game profile to use.',
    'instances.summary.total': 'Total',
    'instances.summary.modded': 'Modded',
    'instances.summary.visible': 'Visible',
    'instances.library.label': 'Library',
    'instances.library.title': 'Your installations',
    'instances.empty': 'No installations yet. Create one to get started.',
    'instances.search': 'Search instance...',
    'instances.add': 'Add installation',
'instances.import': 'Import modpack',
'instances.importing': 'Importing...',
'instances.importSuccess': 'Modpack imported: {name}',
'instances.importError': 'Error importing modpack',
'instances.importInvalid': 'Invalid .mrpack file',
    'instances.open': 'Open',
    'instances.current': 'Current',
    'account.title': 'Account manager',
    'account.offline': 'Offline account',
    'account.none': 'No account',
    'account.ms.section': 'Microsoft accounts',
    'account.offline.section': 'Offline accounts',
    'account.add': 'Add',
    'account.placeholder': 'New offline name',
    'account.ms.login': 'Sign in with Microsoft',
    'account.ms.opening': 'Opening Microsoft...',
    'account.ms.waiting': 'Waiting for login...',
    'account.ms.none': 'No Microsoft accounts added.',
    'account.ms.premium': 'Microsoft · Premium',
    'account.ms.active': '· Active',
    'account.offline.active': '· Active',
    'confirm.delete.account': 'Delete account "{name}"? This action cannot be undone.',
    'confirm.logout.ms': 'Sign out of this Microsoft account? You\'ll need to sign in again to use it.',
    'confirm.delete': 'Delete',
    'confirm.cancel': 'Cancel',
    'confirm.title': 'Confirm',
    'app.ready': 'Ready to play',
    'app.launchError': 'Error launching Minecraft',
    'app.minecraftStarting': 'Minecraft starting...',
    'app.playing': 'Playing...',
    'app.downloadingFiles': 'Downloading files...',
    'app.close': 'Close',
    'app.window.minimize': 'Minimize window',
    'app.window.maximize': 'Maximize window',
    'app.window.close': 'Close window',
    'sidebar.collapse': 'Collapse sidebar',
    'sidebar.expand': 'Expand sidebar',
    'nav.main': 'Main navigation',
    'account.open': 'Open account manager',
    'account.mode.offline': 'Offline mode',
    'account.mode.microsoft': 'Microsoft account',
    'account.ms.premiumStatus': 'Microsoft account · Premium',
    'account.none.offline': 'No offline accounts.',
    'account.delete': 'Delete account',
    'account.selected': 'Selected account: {name}',
    'account.name.required': 'Type a name',
    'account.name.invalid': 'Invalid name: use 3-16 letters, numbers or _',
    'account.exists': 'An account with that name already exists',
    'account.added': 'Offline account added: {name}',
    'account.added.microsoft': 'Account added: {name}!',
    'account.logout': 'Sign out',
    'time.now': 'Now',
    'time.minutes': '{count} min ago',
    'time.hours': '{count} h ago',
    'time.days': '{count} days ago',
    'time.weeks': '{count} weeks ago',
    'time.months': '{count} months ago',
    'instance.label': 'Installation',
    'instance.title.fallback': 'Instance',
    'instance.isolatedFolder': 'isolated folder',
    'instance.controlCenter': 'Control center',
    'instance.managerHint': 'Manage content, files, worlds and logs.',
    'instance.loaderLabel': 'Loader',
    'instance.versionLabel': 'Version',
    'instance.modsCount': 'Mods',
    'instance.worldsCount': 'Worlds',
    'instance.quickFolders': 'Quick access',
    'instance.play': 'Play',
    'instance.refresh': 'Refresh',
    'instance.discover': 'Discover',
    'instance.content': 'Content',
    'instance.folders': 'Folders',
    'instance.worlds': 'Worlds',
    'instance.logs': 'Logs',
    'instance.openFolder': 'Open folder',
    'instance.openInstanceFolder': 'Open instance folder',
    'instance.openMods': 'Open mods',
    'instance.minecraftLogs': 'Minecraft logs',
    'instance.launcherLogs': 'Launcher logs',
    'instance.console': 'Launch console',
    'instance.clear': 'Clear',
    'instance.selectedStatus': 'Instance: {name}',
    'instance.folderOpened': 'Instance folder opened',
    'instance.folderOpen': 'Folder opened',
    'instance.modUpdated': 'Mod updated',
    'instance.emptyMods': 'There are no mods in this instance yet',
    'instance.emptyWorlds': 'There are no saved worlds in this instance',
    'instance.emptyLogs': 'No logs to show yet',
    'instance.active': 'Active',
    'instance.disabled': 'Disabled',
    'instance.enable': 'Enable',
    'instance.disable': 'Disable',
    'instance.updatedAt': 'Updated: {date}',
    'instance.world': 'World',
    'instance.folder.root': 'Instance',
    'instance.folder.saves': 'Worlds',
    'instances.use': 'Use',
    'instances.lastSelected': 'Last selected',
    'instances.stable': 'Stable',
    'instances.modFriendly': 'Compatible with many mods',
    'instances.oldModpacks': 'Good for old modpacks',
    'discover.loaded': 'Results loaded',
    'discover.noResults': 'Nothing found. Try another search.',
    'discover.loadingResults': 'Loading results...',
    'discover.searchFailed': 'Could not search Modrinth.',
    'discover.openingProject': 'Opening project on Modrinth',
    'discover.noDescription': 'No description.',
    'discover.resultsSummary': '{start}-{end} of {total} results',
    'discover.pageSummary': 'Page {page} of {pages}',
    'home.title': 'Home',
    'home.optimized.title': 'Create optimized installation',
    'home.optimized.loading': 'Keo Optimized · loading from Modrinth...',
    'home.optimized.meta': 'Keo Optimized · by {creator} · {downloads} downloads',
    'home.optimized.fallbackDesc': 'Optimization pack to improve FPS while keeping a vanilla-like experience.',
    'home.optimized.versionUnknown': 'Latest',
    'home.optimized.loadError': 'Could not load Keo Optimized from Modrinth.',
    'home.optimized.notFound': 'Could not find Keo Optimized on Modrinth.',
    'home.search.mods': 'Search mods...',
    'home.search.resourcepacks': 'Search resource packs...',
    'home.search.datapacks': 'Search data packs...',
    'home.search.shaders': 'Search shaders...',
    'home.search.content': 'Search content...',
    'home.sort.label': 'Sort by',
    'home.sort.relevance': 'Sort by: Relevance',
    'home.sort.downloads': 'Sort by: Downloads',
    'home.sort.followers': 'Sort by: Followers',
    'home.sort.updated': 'Sort by: Updated',
    'home.sort.newest': 'Sort by: Newest',
    'home.limit.label': 'Results per page',
    'home.limit': 'Show: {count}',
    'home.prevPage': 'Previous page',
    'home.nextPage': 'Next page',
    'home.noCompatible': 'No compatible content for this installation.',
    'home.loadingContent': 'Loading content...',
    'home.searchFailed': 'Could not search content.',
    'home.loadedFor': '{type} for {version} loaded',
    'home.vanillaModsWarning': 'This installation is vanilla. Create one with Fabric, Forge or similar to install mods.',
    'home.installing': 'Installing...',
    'home.installingRelease': 'Installing stable release of {title}',
    'home.installed': 'Installed: {name}',
    'install.title': 'Install content',
    'install.titleProject': 'Install {title}',
    'install.any': 'Any',
    'install.destination': 'Destination',
    'install.destination.downloads': 'PC - Downloads folder',
    'install.destination.instance': 'Launcher installation',
    'install.destination.newInstance': 'New instance',
    'install.destination.downloadsShort': 'Downloads folder',
    'install.instance': 'Installation',
    'install.compatibleVersions': 'Compatible versions',
    'install.versions': 'Versions',
    'install.note': 'Choose version, loader and destination.',
    'install.cancel': 'Cancel',
    'install.install': 'Install',
    'install.download': 'Download',
    'install.downloading': 'Downloading...',
    'install.installing': 'Installing...',
    'install.loadingVersions': 'Loading versions...',
    'install.loadingModpackVersions': 'Loading modpack versions...',
    'install.searchingCompatible': 'Searching compatible versions...',
    'install.checkingCompatibility': 'Checking compatibility...',
    'install.noModpackVersions': 'No versions available for this modpack.',
    'install.noCompatible': 'No compatible versions for that combination.',
    'install.noCompatibleNote': 'Not compatible with that version/loader.',
    'install.noLoaders': 'This version does not list compatible loaders.',
    'install.noVersions': 'No compatible versions.',
    'install.availableVersions': '{count} version(s) available.',
    'install.compatibleFound': '{count} compatible version(s) found.',
    'install.pickVersion': 'Choose a compatible version first',
    'install.working': 'Working... modpacks can take a bit.',
    'install.done': 'Done: {path}',
    'install.downloaded': 'Downloaded to Downloads',
    'install.installedLauncher': 'Installed in the launcher',
    'create.title': '+ New installation',
    'create.snapshots': 'Show snapshots · test versions',
    'create.minecraftVersion': 'Minecraft version',
    'create.searchVersion': 'Search version...',
    'create.note': 'Choose loader and version.',
    'create.create': 'Create installation',
    'create.loadingVersions': 'Loading versions...',
    'create.compatibleVersions': '{count} compatible versions.',
    'create.pickVersion': 'Choose a version first',
    'create.created': 'Installation created: {name}',
    'create.creating': 'Creating...',
    'settings.java.auto': 'Automatic',
    'settings.java.none': 'No Java',
    'settings.java.unknown': 'Unknown',
    'settings.java.loadError': 'Error loading Java installations: {error}',
    'settings.java.renderError': 'Error rendering Java installations',
    'settings.java.saveError': 'Error saving Java path',
    'settings.java.browseError': 'Error browsing Java path',
    'settings.java.detected': 'Java {major} detected',
    'settings.java.detectError': 'Error detecting Java',
    'settings.java.downloading': 'Downloading Java {major}...',
    'settings.java.installed': 'Java {major} installed',
    'settings.java.installError': 'Error installing Java',
    'settings.dataRoot.openError': 'Error opening data folder',
    'settings.cache.purgeFailed': 'Could not purge cache',
    'settings.cache.purgeError': 'Error purging cache',
    'settings.background.loadFailed': 'Could not load image',
    'settings.background.pickError': 'Error choosing background image',
    'settings.background.clearError': 'Error removing background image',
    'settings.validation.username': 'Invalid offline name: use 3-16 letters, numbers or _',
    'settings.validation.ram': 'Invalid RAM: use something like 2048, 4096M or 4G',
    'settings.validation.ramOrder': 'Minimum RAM cannot be greater than maximum RAM',
    'settings.validation.error': 'Error validating settings',
    'settings.saveError': 'Error saving settings',
    'settings.resetError': 'Error resetting settings',
    'skins.apply': 'Apply skin',
    'skins.kicker': 'PLAYER IDENTITY',
    'skins.title': 'Skins',
    'skins.subtitle': 'Find, preview and save your next look.',
    'skins.upload': 'Upload skin',
    'skins.saveFavorite': 'Save favorite',
    'skins.popular': 'Popular',
    'skins.favorites': 'Favorites',
    'skins.uploadTab': 'Upload',
    'skins.featured': 'Featured players',
    'skins.loading': 'Loading players...',
    'skins.searching': 'Searching "{q}"...',
    'skins.searchResult': 'Result — {name}',
    'skins.searchNotFound': 'User <strong>"{q}"</strong> not found.<br>Make sure the name is exact.',
    'skins.sourcePopular': 'POPULAR',
    'skins.sourceSearch': 'SEARCH',
    'skins.sourceFavorite': 'FAVORITE',
    'skins.sourceUpload': 'OWN',
    'skins.sourceEquipped': 'EQUIPPED',
    'skins.equipped': 'Equipped skin — your current premium skin',
    'skins.modelClassic': 'CLASSIC',
    'skins.modelSlim': 'SLIM',
    'skins.view2dActive': '✓ 2D view active',
    'skins.skinLoaded': '✓ Skin loaded',
    'skins.skinLoadError': '❌ Error loading skin',
    'skins.viewerNotInitialized': '❌ Viewer not initialized',
    'skins.skinApplied': '✓ Skin applied. Will appear in game.',
    'skins.skinSavedLocal': '✓ Saved locally (only visible to you).',
    'skins.tryAgain': 'try again',
    'skins.applying': 'Applying...',
    'skins.favoriteSaved': '★ Saved to favorites',
    'skins.noFavorites': 'You don\'t have favorite skins yet.<br>Mark a skin with ★ to save it here.',
    'skins.myFavorites': 'My favorites ({count})',
    'skins.dragDrop': 'Drag your skin here',
    'skins.orClick': 'or click to select a file<br>',
    'skins.fileSpec': '<span style="font-size:11px;color:#555">PNG · 64×64 or 64×32 px</span>',
    'skins.pngOnly': 'Only .png files are accepted',
    'skins.previewReady': '✓ Preview ready. Click "Apply skin".',
    'skins.selectSkin': 'Select a skin to begin',
    'skins.webglUnavailable': '⚠️ WebGL unavailable. Using 2D view.',
    'skins.skinview3dUnavailable': '⚠️ skinview3d unavailable. Using 2D view.',
    'skins.error3d': '⚠️ 3D error. Using 2D view.',
    'skins.skinview3dLoadError': '❌ Error: Could not load 3D viewer. Check your connection.'
  }
}

let settings = {
  username: '',
  minRam: '2G',
  maxRam: '4G',
  minRamMb: 2048,
  maxRamMb: 4096,
  language: 'es',
  theme: 'kindyr',
  backgroundImage: '',
  javaArgs: '',
  maxConcurrentDownloads: 6,
  eagerPrepareOnCreate: false
}
let accounts = []
const consoleLines = []
let pendingConsoleLines = []
let pendingConsoleBytes = 0
let consoleBytes = 0
let droppedConsoleLines = 0
let consoleFlushTimer = null
let consolePanelVisible = false
const maxConsoleLines = 120
const maxConsoleBytes = 32 * 1024
const maxPendingConsoleLines = 40
const maxPendingConsoleBytes = 8 * 1024
const consoleDropPrefix = '[UI] '
const consoleTextEncoder = new TextEncoder()

function getConsoleLineBytes(line) {
  return consoleTextEncoder.encode(line).length
}
let activeInstanceTab = 'content'
let launcherInstances = []
const RECENT_INSTANCES_KEY = 'kindyr-recent-instances'
const MAX_RECENT_INSTANCES = 6

function t(key, vars = {}) {
  const dict = I18N[settings.language] || I18N.es
  let text = dict[key] || I18N.es[key] || key
  Object.keys(vars).forEach(name => {
    const placeholder = '{' + name + '}'
    const value = String(vars[name] ?? '')
    text = text.split(placeholder).join(value)
  })
  return text
}

function applyLanguage() {
  document.documentElement.lang = settings.language === 'en' ? 'en' : 'es'

  translateElement(document)

  const navTranslations = {
    'nav-home': 'nav.home',
    'nav-instances': 'nav.instances',
    'nav-discover': 'nav.discover',
    'nav-skins': 'nav.skins',
    'nav-settings': 'nav.settings'
  }
  Object.entries(navTranslations).forEach(([id, key]) => {
    const nav = document.getElementById(id)
    if (!nav) return
    const label = nav.querySelector('.nav-label')
    const translated = t(key)
    if (label) label.textContent = translated
    nav.dataset.viewTitle = translated
  })

  const topbarTitle = document.getElementById('topbar-title')
  if (topbarTitle && topbarTitle.dataset.i18nKey) topbarTitle.textContent = t(topbarTitle.dataset.i18nKey)

  if (typeof renderDiscoverTypes === 'function') renderDiscoverTypes()
  if (typeof syncDiscoverContextView === 'function') syncDiscoverContextView(false)
  if (typeof renderLauncherInstancesList === 'function') renderLauncherInstancesList()
  if (typeof renderRecentInstances === 'function') renderRecentInstances()
  if (typeof renderKeoOptimizedCard === 'function') renderKeoOptimizedCard(typeof keoOptimizedProject !== 'undefined' ? keoOptimizedProject : null)
  if (typeof renderAccounts === 'function') renderAccounts()
  if (typeof applyActiveAccount === 'function') applyActiveAccount(settings.username, settings.accountType || 'offline')
  if (typeof renderJavaInstalls === 'function') renderJavaInstalls(true)
  if (typeof updateHomeView === 'function') updateHomeView()
  if (typeof loadInstanceDetailContent === 'function' && document.getElementById('instance-detail-view')?.classList.contains('active')) {
    loadInstanceDetailContent()
  }

  if (typeof syncKindyrSelects === 'function') syncKindyrSelects()
}

function translateElement(root) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (key) {
      const translated = t(key)
      // Claves con HTML (skins.searchNotFound) deben usar innerHTML
      if (translated.includes('<')) el.innerHTML = translated
      else el.textContent = translated
    }
  })
  
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder')
    if (key) el.placeholder = t(key)
  })

  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title')
    if (key) el.title = t(key)
  })

  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label')
    if (key) el.setAttribute('aria-label', t(key))
  })

  root.querySelectorAll('[data-i18n-view-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-view-title')
    if (key) el.dataset.viewTitle = t(key)
  })

  root.querySelectorAll('option[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (key) el.textContent = t(key)
  })
}

const kindyrSelectIcons = {
  'install-loader': 'fa-gears',
  'install-destination': 'fa-folder-open',
  'install-instance': 'fa-layer-group',
  'discover-version': 'fa-cube',
  'discover-loader': 'fa-gears',
  'discover-sort': 'fa-arrow-down-wide-short',
  'discover-limit': 'fa-list-ol'
}

let kindyrSelectsInitialized = false
let openKindyrSelect = null

function closeKindyrSelects(except = null) {
  const wrapper = openKindyrSelect
  if (!wrapper || wrapper === except) return
  wrapper.classList.remove('open')
  const trigger = wrapper.querySelector('.kindyr-select-trigger')
  const menu = wrapper.querySelector('.kindyr-select-menu')
  const chevron = wrapper.querySelector('.kindyr-select-chevron')
  if (trigger) trigger.setAttribute('aria-expanded', 'false')
  if (menu) menu.hidden = true
  if (chevron) chevron.className = 'fa-solid fa-chevron-down kindyr-select-chevron'
  openKindyrSelect = null
}

function syncKindyrSelect(select) {
  const state = select?.__kindyrSelect
  if (!state) return

  const { trigger, label, menu } = state
  const options = Array.from(select.options)
  const selectedOption = select.options[select.selectedIndex]
  label.textContent = selectedOption?.textContent?.trim() || select.getAttribute('placeholder') || ''
  trigger.disabled = select.disabled
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || label.textContent)
  const optionsSignature = JSON.stringify(options.map(option => [option.value, option.textContent, option.disabled]))

  if (state.optionsSignature !== optionsSignature) {
    menu.replaceChildren()
    state.optionButtons = options.map(option => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'type-chip kindyr-select-option'
      item.setAttribute('role', 'option')

      const marker = document.createElement('i')
      marker.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.textContent = option.textContent.trim()
      item.append(marker, text)

      item.addEventListener('click', () => {
        if (option.disabled) return
        option.selected = true
        select.dispatchEvent(new Event('change', { bubbles: true }))
        closeKindyrSelects()
        trigger.focus()
      })
      menu.appendChild(item)
      return { item, marker }
    })
    state.optionsSignature = optionsSignature
  }

  state.optionButtons.forEach(({ item, marker }, index) => {
    const option = options[index]
    const isSelected = index === select.selectedIndex
    item.classList.toggle('active', isSelected)
    item.disabled = option.disabled
    item.setAttribute('aria-selected', String(isSelected))
    marker.className = 'fa-solid ' + (isSelected ? 'fa-square-check' : 'fa-square')
  })
}

function enhanceKindyrSelect(select) {
  if (!(select instanceof HTMLSelectElement) || select.__kindyrSelect) return

  const wrapper = document.createElement('div')
  wrapper.className = 'kindyr-select'
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'type-chip kindyr-select-trigger'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')

  const triggerContent = document.createElement('span')
  const icon = document.createElement('i')
  icon.className = 'fa-solid ' + (kindyrSelectIcons[select.id] || 'fa-list')
  icon.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className = 'kindyr-select-label'
  const chevron = document.createElement('i')
  chevron.className = 'fa-solid fa-chevron-down kindyr-select-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  triggerContent.append(icon, label)
  trigger.append(triggerContent, chevron)

  const menu = document.createElement('div')
  menu.className = 'kindyr-select-menu'
  menu.setAttribute('role', 'listbox')
  menu.hidden = true

  select.parentNode.insertBefore(wrapper, select)
  wrapper.append(select, trigger, menu)
  select.classList.add('kindyr-native-select')
  select.__kindyrSelect = { wrapper, trigger, label, menu }
  select.__kindyrSync = () => syncKindyrSelect(select)

  trigger.addEventListener('click', event => {
    event.stopPropagation()
    if (select.disabled) return
    const shouldOpen = !wrapper.classList.contains('open')
    closeKindyrSelects(wrapper)
    wrapper.classList.toggle('open', shouldOpen)
    menu.hidden = !shouldOpen
    trigger.setAttribute('aria-expanded', String(shouldOpen))
    chevron.className = 'fa-solid fa-chevron-' + (shouldOpen ? 'up' : 'down') + ' kindyr-select-chevron'
    openKindyrSelect = shouldOpen ? wrapper : null
    if (shouldOpen) {
      const rect = wrapper.getBoundingClientRect()
      const width = Math.max(rect.width, 220)
      const menuHeight = Math.min(menu.scrollHeight, 270)
      wrapper.classList.toggle('align-right', rect.left + width > window.innerWidth - 12)
      wrapper.classList.toggle('align-up', rect.bottom + menuHeight + 8 > window.innerHeight - 12 && rect.top > menuHeight + 8)
    }
  })
  select.addEventListener('change', () => syncKindyrSelect(select))
  syncKindyrSelect(select)
}

function syncKindyrSelects(root = document) {
  const selects = root instanceof HTMLSelectElement
    ? [root]
    : Array.from(root.querySelectorAll?.('select') || [])
  selects.forEach(select => {
    if (select.__kindyrSync) select.__kindyrSync()
    else enhanceKindyrSelect(select)
  })
}

function patchKindyrSelectProperty(property) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property)
  if (!descriptor?.get || !descriptor?.set || descriptor.set.__kindyrPatched) return
  const nativeSetter = descriptor.set
  const patchedSetter = function(value) {
    nativeSetter.call(this, value)
    queueMicrotask(() => this.__kindyrSync?.())
  }
  patchedSetter.__kindyrPatched = true
  Object.defineProperty(HTMLSelectElement.prototype, property, {
    ...descriptor,
    set: patchedSetter
  })
}

function initKindyrSelects() {
  if (kindyrSelectsInitialized) return
  kindyrSelectsInitialized = true
  patchKindyrSelectProperty('value')
  syncKindyrSelects()

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return
      if (node.matches('select')) enhanceKindyrSelect(node)
      node.querySelectorAll?.('select').forEach(enhanceKindyrSelect)
    }))
  })
  observer.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('click', () => closeKindyrSelects())
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeKindyrSelects()
  })
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme || 'midnight'
  document.documentElement.style.colorScheme = settings.theme === 'steel' ? 'light' : 'dark'
  const themeChips = document.querySelectorAll('.theme-chip')
  themeChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.theme === settings.theme)
  })
  const logoEl = document.querySelector('.logo-area img')
  if (logoEl) {
    const logoSrc = settings.theme === 'steel' ? 'assets/logo-light.png' : 'assets/logo-dark.png'
    logoEl.style.display = ''
    if (!logoEl.src.endsWith(logoSrc)) logoEl.src = logoSrc
  }
}

function toFileUrl(filePath) {
  if (!filePath) return ''
  if (filePath.startsWith('file://')) return filePath
  return 'file:///' + filePath.replace(/\\/g, '/')
}

function applyBackground() {
  const content = document.querySelector('.content')
  const preview = document.getElementById('settings-bg-preview')
  if (!content) return

  const existingVideo = document.getElementById('custom-bg-video')
  if (existingVideo) existingVideo.remove()
  content.classList.remove('has-custom-bg', 'has-video-bg')
  content.style.removeProperty('--custom-bg')
  if (preview) {
    preview.style.backgroundImage = ''
    const previewVideo = preview.querySelector('video')
    if (previewVideo) previewVideo.remove()
  }

  if (!settings.backgroundImage) return

  const url = toFileUrl(settings.backgroundImage)
  const isVideo = /\.(mp4|webm|ogg)$/i.test(settings.backgroundImage)

  if (isVideo) {
    const video = document.createElement('video')
    video.id = 'custom-bg-video'
    video.src = url
    video.preload = 'metadata'
    video.autoplay = true
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.addEventListener('error', (e) => {
      window.kindyrAPI?.log?.error('Video error code: ' + (e.target?.error?.code) + ' msg: ' + (e.target?.error?.message))
    })
    video.addEventListener('loadeddata', () => {
      window.kindyrAPI?.log?.info('Video cargado ok: ' + url)
    })
    content.classList.add('has-video-bg')
    requestAnimationFrame(() => {
      content.insertBefore(video, content.firstChild)
      syncRendererActivity()
    })

    if (preview) {
      const previewVideo = document.createElement('video')
      previewVideo.src = url
      previewVideo.preload = 'metadata'
      previewVideo.loop = true
      previewVideo.muted = true
      previewVideo.playsInline = true
      previewVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;'
      preview.appendChild(previewVideo)
      syncRendererActivity()
    }
  } else {
    content.classList.add('has-custom-bg')
    content.style.setProperty('--custom-bg', 'url("' + url + '")')
    if (preview) preview.style.backgroundImage = 'url("' + url + '")'
  }
}

function syncRendererActivity() {
  const appIsActive = !document.hidden && document.hasFocus()
  const activeSection = typeof currentSection === 'string' ? currentSection : ''
  document.querySelectorAll('#custom-bg-video, #settings-bg-preview video').forEach(video => {
    const isSettingsPreview = Boolean(video.closest('#settings-bg-preview'))
    const shouldPlay = appIsActive && (!isSettingsPreview || activeSection === 'settings')
    if (shouldPlay) video.play().catch(() => {})
    else video.pause()
  })

  if (typeof setSkinsPerformanceMode === 'function') {
    setSkinsPerformanceMode(appIsActive && activeSection === 'skins')
  }
}

document.addEventListener('visibilitychange', syncRendererActivity)
window.addEventListener('focus', syncRendererActivity)
window.addEventListener('blur', syncRendererActivity)

function mbToRamString(mb) {
  if (mb % 1024 === 0) return (mb / 1024) + 'G'
  return mb + 'M'
}

function parseRamInput(value) {
  const clean = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!clean) return null
  const match = clean.match(/^(\d+(?:\.\d+)?)(G|M|GB|MB)?$/)
  if (!match) return null
  const amount = Number(match[1])
  const unit = (match[2] || 'M').replace('B', '')
  const mb = unit === 'G' ? Math.round(amount * 1024) : Math.round(amount)
  if (mb < 512 || mb > 32768) return null
  return mb
}

function syncRamFromSlider(kind) {
  const slider = document.getElementById('setting-' + kind + '-ram-slider')
  const input = document.getElementById('setting-' + kind + '-ram-mb')
  const hint = document.getElementById('setting-' + kind + '-ram-hint')
  const mb = Number(slider.value)
  input.value = String(mb)
  hint.textContent = mb + ' MB (' + mbToRamString(mb) + ')'
  settings[kind + 'RamMb'] = mb
  settings[kind + 'Ram'] = mbToRamString(mb)
}

function syncRamFromInput(kind) {
  const input = document.getElementById('setting-' + kind + '-ram-mb')
  const slider = document.getElementById('setting-' + kind + '-ram-slider')
  const hint = document.getElementById('setting-' + kind + '-ram-hint')
  const mb = parseRamInput(input.value)
  if (!mb) {
    hint.textContent = 'Inválido (512-32768 MB, ej: 2048 o 4G)'
    hint.style.color = '#ff5a3c'
    return
  }
  hint.style.color = ''
  input.value = String(mb)
  slider.value = String(mb)
  hint.textContent = mb + ' MB (' + mbToRamString(mb) + ')'
  settings[kind + 'RamMb'] = mb
  settings[kind + 'Ram'] = mbToRamString(mb)
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function formatCompactNumber(value) {
  const number = Number(value) || 0
  if (number >= 1000000) return (number / 1000000).toFixed(1) + 'M'
  if (number >= 1000) return (number / 1000).toFixed(1) + 'K'
  return String(number)
}

function formatRelativeTime(value) {
  if (!value) return ''
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return t('time.minutes', { count: Math.max(1, minutes) })
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return t('time.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 14) return t('time.days', { count: days })
  const weeks = Math.floor(days / 7)
  if (weeks < 8) return t('time.weeks', { count: weeks })
  const months = Math.floor(days / 30)
  return t('time.months', { count: Math.max(1, months) })
}

function setStatus(message) {
  const statusEl = document.getElementById('status')
  if (statusEl) statusEl.textContent = message
}

function isValidUsername(name) {
  return /^[A-Za-z0-9_]{3,16}$/.test(name)
}

function parseRam(value) {
  const clean = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  const match = clean.match(/^(\d+(?:\.\d+)?)(G|M|GB|MB)?$/)
  if (!match) return null
  const amount = Number(match[1])
  const unit = (match[2] || 'M').replace('B', '')
  const mb = unit === 'G' ? Math.round(amount * 1024) : Math.round(amount)
  if (!Number.isFinite(mb) || mb < 512 || mb > 32768) return null
  const normalized = unit === 'G' ? (mb % 1024 === 0 ? (mb / 1024) + 'G' : mb + 'M') : mb + 'M'
  return { value: normalized, mb }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return
  const collapsed = sidebar.classList.toggle('collapsed')
  localStorage.setItem('kindyr-sidebar-collapsed', collapsed ? '1' : '0')
}

function loadSidebarState() {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return
  const collapsed = localStorage.getItem('kindyr-sidebar-collapsed') === '1'
  sidebar.classList.toggle('collapsed', collapsed)
}

function appendConsole(type, message) {
  if (!consolePanelVisible) {
    const panel = document.getElementById('console-panel')
    if (panel) panel.classList.add('active')
    consolePanelVisible = true
  }

  const prefix = type.toUpperCase().padEnd(8, ' ')
  const cleanMessage = String(message).replace(/\s+/g, ' ').slice(0, 180)
  const line = `[${new Date().toLocaleTimeString()}] ${prefix} ${cleanMessage}`
  const lineBytes = getConsoleLineBytes(line)
  pendingConsoleLines.push(line)
  pendingConsoleBytes += lineBytes

  while (pendingConsoleLines.length > maxPendingConsoleLines || pendingConsoleBytes > maxPendingConsoleBytes) {
    const dropped = pendingConsoleLines.shift()
    pendingConsoleBytes -= getConsoleLineBytes(dropped)
    droppedConsoleLines++
  }

  if (consoleFlushTimer) return
  consoleFlushTimer = setTimeout(flushConsole, 250)
}

function flushConsole() {
  const output = document.getElementById('console-output')
  if (!output) {
    pendingConsoleLines = []
    pendingConsoleBytes = 0
    consoleFlushTimer = null
    return
  }
  consoleLines.push(...pendingConsoleLines)
  consoleBytes += pendingConsoleBytes
  pendingConsoleLines = []
  pendingConsoleBytes = 0
  while (consoleLines.length > maxConsoleLines || consoleBytes > maxConsoleBytes) {
    const dropped = consoleLines.shift()
    consoleBytes -= getConsoleLineBytes(dropped)
    droppedConsoleLines++
  }
  if (droppedConsoleLines > 0) {
    const summary = `${consoleDropPrefix}Se descartaron ${droppedConsoleLines} líneas de consola para mantener el límite de memoria.`
    const previous = consoleLines.findIndex(line => line.startsWith(consoleDropPrefix))
    if (previous >= 0) {
      consoleBytes -= getConsoleLineBytes(consoleLines[previous])
      consoleLines[previous] = summary
      consoleBytes += getConsoleLineBytes(summary)
    } else {
      consoleLines.push(summary)
      consoleBytes += getConsoleLineBytes(summary)
    }
    droppedConsoleLines = 0
    while (consoleLines.length > maxConsoleLines || consoleBytes > maxConsoleBytes) {
      const dropped = consoleLines.shift()
      consoleBytes -= getConsoleLineBytes(dropped)
    }
  }
  output.textContent = consoleLines.join('\n')
  output.scrollTop = output.scrollHeight
  consoleFlushTimer = null
}

function clearConsole() {
  consoleLines.length = 0
  pendingConsoleLines = []
  pendingConsoleBytes = 0
  consoleBytes = 0
  droppedConsoleLines = 0
  const output = document.getElementById('console-output')
  if (output) output.textContent = ''
}

function closeWindow() { window.kindyrAPI.window.close() }
function minimizeWindow() { window.kindyrAPI.window.minimize() }
function maximizeWindow() { window.kindyrAPI.window.maximize() }

function loadRecentInstanceIds() {
  try {
    const data = JSON.parse(localStorage.getItem(RECENT_INSTANCES_KEY) || '[]')
    return Array.isArray(data) ? data.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveRecentInstanceIds(ids) {
  localStorage.setItem(RECENT_INSTANCES_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_INSTANCES)))
}

function pruneRecentInstanceIds() {
  const valid = new Set(launcherInstances.map(instance => instance.id))
  saveRecentInstanceIds(loadRecentInstanceIds().filter(id => valid.has(id)))
}

function recordRecentInstance(instanceId) {
  if (!instanceId) return
  const ids = loadRecentInstanceIds().filter(id => id !== instanceId)
  ids.unshift(instanceId)
  saveRecentInstanceIds(ids)
  if (typeof renderRecentInstances === 'function') renderRecentInstances()
}

function loadAccounts() {
  const saved = JSON.parse(localStorage.getItem('kindyr-accounts') || '[]')
  accounts = Array.isArray(saved) ? saved : []
  if (settings.accountType !== 'microsoft' && isValidUsername(settings.username)) ensureAccount(settings.username)
  if (typeof renderAccounts === 'function') renderAccounts()
}

function saveAccounts() {
  localStorage.setItem('kindyr-accounts', JSON.stringify(accounts))
}

function ensureAccount(name) {
  if (!isValidUsername(name)) return
  if (!accounts.some(account => account.name.toLowerCase() === name.toLowerCase())) {
    accounts.push({ name, type: 'offline' })
    saveAccounts()
  }
}

function renderAccounts() {
  const list = document.getElementById('account-list')
  if (!list) return
  list.innerHTML = accounts
    .filter(a => a.type === 'offline')
    .map(a => {
      const isActive = a.name === settings.username && settings.accountType !== 'microsoft'
      return `
        <div class="account-item ${isActive ? 'active' : ''}" onclick="selectOfflineAccount(this.dataset.name)" data-name="${escapeHtml(a.name)}">
          <div class="avatar offline">
            ${getInitials(a.name)}
          </div>
          <div class="account-meta">
            <strong>${escapeHtml(a.name)}</strong>
            <span>${escapeHtml(t('account.mode.offline'))}${isActive ? ' ' + t('account.offline.active') : ''}</span>
          </div>
          <button type="button" class="icon-action" onclick="deleteOfflineAccount(event, '${escapeHtml(a.name)}')" title="${escapeHtml(t('account.delete'))}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `
    }).join('') || '<div style="color:#666;font-size:13px;">' + escapeHtml(t('account.none.offline')) + '</div>'
}
function getInitials(name) {
  return isValidUsername(name) ? name.slice(0, 2).toUpperCase() : '--'
}

function getPremiumHeadUrl(uuid) {
  const clean = String(uuid || '').replace(/-/g, '').trim()
  if (!/^[a-f0-9]{32}$/i.test(clean)) return ''
  return `https://mc-heads.net/avatar/${clean}/48`
}

function setAvatarContent(element, name, type, uuid) {
  if (!element) return
  element.className = 'avatar ' + (type === 'microsoft' ? 'premium' : 'offline')
  const headUrl = type === 'microsoft' ? getPremiumHeadUrl(uuid) : ''
  if (headUrl) {
    element.textContent = ''
    element.style.padding = '0'
    element.style.overflow = 'hidden'
    const img = document.createElement('img')
    img.src = headUrl
    img.alt = name || 'avatar'
    img.loading = 'eager'
    img.decoding = 'async'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.style.imageRendering = 'pixelated'
    img.style.display = 'block'
    img.onerror = () => {
      element.textContent = getInitials(name)
      element.style.padding = ''
      element.style.overflow = ''
    }
    element.appendChild(img)
  } else {
    element.textContent = getInitials(name)
    element.style.padding = ''
    element.style.overflow = ''
  }
}

async function hydratePremiumAvatars() {
  if (settings.accountType !== 'microsoft' || !isValidUsername(settings.username)) return
  try {
    if (!window.kindyrAPI?.microsoft?.list) return
    const result = await window.kindyrAPI.microsoft.list()
    if (!result?.ok || !Array.isArray(result.accounts)) return
    const active = result.accounts.find(a => a.active) || result.accounts.find(a => a.name === settings.username)
    if (!active || !active.uuid) return
    if (active.name !== settings.username) {
      settings.username = active.name
      settings.settingsSavedAt = Date.now()
      localStorage.setItem('kindyr-settings', JSON.stringify(settings))
      const usernameEl = document.getElementById('username')
      if (usernameEl) usernameEl.textContent = active.name
      const modalNameEl = document.getElementById('modal-current-name')
      if (modalNameEl) modalNameEl.textContent = active.name
    }
    settings.activeUuid = String(active.uuid).replace(/-/g, '')
    settings.settingsSavedAt = Date.now()
    localStorage.setItem('kindyr-settings', JSON.stringify(settings))
    const avatarEls = document.querySelectorAll('.topnav-account .avatar, .profile-area .avatar, #nav-avatar, #modal-avatar')
    avatarEls.forEach(el => setAvatarContent(el, active.name, 'microsoft', active.uuid))
    if (typeof window.refreshSkinsEquipped === 'function') {
      try { window.refreshSkinsEquipped() } catch {}
    }
  } catch {}
}

function applyActiveAccount(name, type = 'offline', uuid = '') {
  const hasAccount = isValidUsername(name)
  settings.username = hasAccount ? name : ''
  settings.accountType = type
  if (type === 'microsoft' && uuid) settings.activeUuid = String(uuid).replace(/-/g, '')
  else if (type !== 'microsoft') delete settings.activeUuid
  settings.settingsSavedAt = Date.now()
  localStorage.setItem('kindyr-settings', JSON.stringify(settings))
  const usernameEl = document.getElementById('username')
  const avatarEls = document.querySelectorAll('.topnav-account .avatar, .profile-area .avatar, #nav-avatar')
  const modeEl = document.querySelector('.topnav-account-mode, .profile-mode')
  const modalNameEl = document.getElementById('modal-current-name')
  const modalAvatarEl = document.getElementById('modal-avatar')
  const modalModeEl = document.querySelector('.account-current span')
  if (usernameEl) usernameEl.textContent = hasAccount ? name : t('account.none')
  avatarEls.forEach(el => setAvatarContent(el, name, type, uuid || settings.activeUuid || ''))
  if (modeEl) modeEl.textContent = hasAccount ? (type === 'microsoft' ? t('account.mode.microsoft') : t('account.mode.offline')) : t('account.none')
  if (modalNameEl) modalNameEl.textContent = hasAccount ? name : t('account.none')
  if (modalAvatarEl) setAvatarContent(modalAvatarEl, name, type, uuid || settings.activeUuid || '')
  if (modalModeEl) modalModeEl.textContent = hasAccount ? (type === 'microsoft' ? t('account.ms.premiumStatus') : t('account.offline')) : t('account.none.offline')
  if (typeof renderAccounts === 'function') renderAccounts()
  if (type === 'microsoft' && !uuid) hydratePremiumAvatars()
  else if (type === 'microsoft' && typeof window.refreshSkinsEquipped === 'function') {
    try { window.refreshSkinsEquipped() } catch {}
  }
}

function openAccountManager() {
  const modal = document.getElementById('account-modal')
  if (modal) modal.classList.add('active')
  if (typeof loadMicrosoftAccounts === 'function') loadMicrosoftAccounts()
  
  const modalNameEl = document.getElementById('modal-current-name')
  const modalAvatarEl = document.getElementById('modal-avatar')
  const modalModeEl = document.querySelector('.account-current span')
  if (modalNameEl) modalNameEl.textContent = isValidUsername(settings.username) ? settings.username : t('account.none')
  if (modalAvatarEl) setAvatarContent(modalAvatarEl, settings.username, settings.accountType === 'microsoft' ? 'microsoft' : 'offline', settings.activeUuid || '')
  if (modalModeEl) modalModeEl.textContent = isValidUsername(settings.username)
    ? (settings.accountType === 'microsoft' ? t('account.ms.premiumStatus') : t('account.offline'))
    : t('account.none')
  if (settings.accountType === 'microsoft') hydratePremiumAvatars()
  
  renderAccounts()
}

function closeAccountManager(event) {
  if (event && event.target.id !== 'account-modal') return
  const modal = document.getElementById('account-modal')
  if (modal) modal.classList.remove('active')
}

function selectAccount(name) {
  applyActiveAccount(name)
  setStatus(t('account.selected', { name }))
}

function selectOfflineAccount(name) {
  applyActiveAccount(name, 'offline')
  setStatus(t('account.selected', { name }))
  const modal = document.getElementById('account-modal')
  if (modal) modal.classList.remove('active')
}

function deleteOfflineAccount(event, name) {
  event.stopPropagation()
  showConfirm(t('confirm.delete.account', { name }), () => {
    accounts = accounts.filter(a => a.name !== name)
    saveAccounts()
    if (settings.username === name) {
      const next = accounts.find(a => a.type === 'offline')
      if (next) applyActiveAccount(next.name, 'offline')
      else applyActiveAccount('', 'offline')
    }
    renderAccounts()
  })
}

function addOfflineAccount() {
  const input = document.getElementById('new-account-name')
  const name = input.value.trim()
  if (!name) { setStatus(t('account.name.required')); return }
  if (!isValidUsername(name)) { setStatus(t('account.name.invalid')); return }
  const exists = accounts.some(a => a.name.toLowerCase() === name.toLowerCase())
  if (exists) { setStatus(t('account.exists')); return }
  accounts.push({ name, type: 'offline' })
  saveAccounts()
  input.value = ''
  applyActiveAccount(name, 'offline')
  renderAccounts()
  setStatus(t('account.added', { name }))
}

async function loadSettings() {
  let saved = {}

  if (window.kindyrAPI?.onboarding?.getSettings) {
    try {
      const result = await window.kindyrAPI.onboarding.getSettings()
      if (result?.ok && result.settings) {
        saved = result.settings
      }
    } catch(e) {
    }
  }

try {
  const raw = localStorage.getItem('kindyr-settings')
  if (raw) {
    const local = JSON.parse(raw)
    const localSavedAt = Number(local.settingsSavedAt || 0)
    const diskSavedAt = Number(saved.settingsSavedAt || 0)
    if (diskSavedAt && localSavedAt && diskSavedAt >= localSavedAt) {
      saved = { ...local, ...saved }
    } else if (local.username) {
      saved = { ...saved, ...local }
    } else {
      saved = { ...local, ...saved }
    }
  }
} catch {}

  settings = {
    username: '',
    minRam: '2G',
    maxRam: '4G',
    minRamMb: 2048,
    maxRamMb: 4096,
    language: 'es',
    theme: 'midnight',
    backgroundImage: '',
    javaArgs: '',
    maxConcurrentDownloads: 6,
    eagerPrepareOnCreate: false,
    ...saved
  }
  const legacyThemes = { dark: 'midnight', kindyr: 'midnight', light: 'steel', green: 'azure', neobrutal: 'navy' }
  settings.theme = legacyThemes[settings.theme] || settings.theme

  if (saved.minRam && !saved.minRamMb) {
    const parsedMin = parseRam(saved.minRam)
    if (parsedMin) settings.minRamMb = parsedMin.mb
  }
  if (saved.maxRam && !saved.maxRamMb) {
    const parsedMax = parseRam(saved.maxRam)
    if (parsedMax) settings.maxRamMb = parsedMax.mb
  }
  settings.maxConcurrentDownloads = Math.max(1, Math.min(Number(settings.maxConcurrentDownloads) || 6, 20))
  settings.eagerPrepareOnCreate = Boolean(saved.eagerPrepareOnCreate ?? settings.eagerPrepareOnCreate)
  settings.settingsSavedAt = Number(settings.settingsSavedAt || 0)
  try {
    localStorage.setItem('kindyr-settings', JSON.stringify(settings))
  } catch {}
  if (typeof loadBackgroundFromDisk === 'function') await loadBackgroundFromDisk()

  applyActiveAccount(settings.username, settings.accountType || 'offline', settings.activeUuid || '')
  if (settings.accountType === 'microsoft') hydratePremiumAvatars()
  applyTheme()
  applyLanguage()
}

async function loadBackgroundFromDisk() {
  if (!window.kindyrAPI?.settings?.getBackground) return
  const result = await window.kindyrAPI.settings.getBackground()
  if (result.ok && result.path) settings.backgroundImage = result.path
  applyBackground()
}

let prepareToastEl = null
let prepareToastTimeout = null

function showPrepareToast(name, message = 'Iniciando…') {
  const stack = document.getElementById('prepare-toast-stack')
  if (!stack) return
  if (prepareToastEl) prepareToastEl.remove()
  clearTimeout(prepareToastTimeout)
  const toast = document.createElement('div')
  toast.id = 'prepare-toast'
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.style.cssText = 'pointer-events:auto; width:340px; background:var(--kindyr-surface, #0a2559); border:2px solid var(--kindyr-ink, #010712); border-left:3px solid var(--kindyr-accent, #ff5a3c); border-radius:0; padding:14px; display:flex; flex-direction:column; gap:10px; box-shadow:4px 4px 0 var(--kindyr-ink, #010712); animation: viewIn 0.14s ease-out;'
  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="width:36px;height:36px;border-radius:0;background:var(--kindyr-blue, #4c8dff);color:var(--kindyr-ink, #010712);border:2px solid var(--kindyr-ink, #010712);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:2px 2px 0 var(--kindyr-ink, #010712);"><i class="fa-solid fa-download" aria-hidden="true"></i></div>
      <div style="min-width:0; flex:1;">
        <div style="color:var(--kindyr-text, #f4f8ff);font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif;font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;">${escapeHtml(name)}</div>
        <div id="prepare-toast-message" style="color:var(--kindyr-blue-soft, #aacdff);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;">${escapeHtml(message)}</div>
      </div>
      <button type="button" onclick="hidePrepareToast(true)" style="background:var(--kindyr-accent, #ff5a3c);border:2px solid var(--kindyr-ink, #010712);color:var(--kindyr-ink, #010712);cursor:pointer;font-size:14px;line-height:1;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 var(--kindyr-ink, #010712);font-weight:800;">×</button>
    </div>
    <div style="height:8px;background:var(--kindyr-bg, #030f2b);border:2px solid var(--kindyr-ink, #010712);border-radius:0;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);">
      <div id="prepare-toast-bar" style="height:100%;width:0%;background:var(--kindyr-accent, #ff5a3c);transition:width 0.3s ease;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span id="prepare-toast-percent" style="color:var(--kindyr-accent, #ff5a3c);font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:0.04em;">0%</span>
      <span id="prepare-toast-stage" style="color:var(--kindyr-blue-soft, #79b0ff);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Preparando…</span>
    </div>
  `
  stack.appendChild(toast)
  prepareToastEl = toast
}

function updatePrepareToast(percent, message, stage) {
  if (!prepareToastEl) return
  const bar = document.getElementById('prepare-toast-bar')
  const pctEl = document.getElementById('prepare-toast-percent')
  const msgEl = document.getElementById('prepare-toast-message')
  const stageEl = document.getElementById('prepare-toast-stage')
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  if (bar) bar.style.width = p + '%'
  if (pctEl) pctEl.textContent = p + '%'
  if (msgEl && message) msgEl.textContent = message
  if (stageEl && stage) stageEl.textContent = stage
}

function hidePrepareToast(immediate = false) {
  if (!prepareToastEl) return
  if (immediate) {
    prepareToastEl.remove()
    prepareToastEl = null
    clearTimeout(prepareToastTimeout)
    return
  }
  prepareToastEl.style.opacity = '0'
  prepareToastEl.style.transform = 'translateX(8px)'
  prepareToastEl.style.transition = 'opacity 0.2s, transform 0.2s'
  prepareToastTimeout = setTimeout(() => {
    if (prepareToastEl) prepareToastEl.remove()
    prepareToastEl = null
  }, 220)
}

// Compatibilidad con modal previo (ahora toast)
function showPrepareProgress(name, message) { showPrepareToast(name, message) }
function updatePrepareProgress(percent, message, stage) { updatePrepareToast(percent, message, stage) }
function hidePrepareProgress(immediate) { hidePrepareToast(immediate) }

function showUpdateNotice() {
  if (window.kindyrAPI?.updater?.showUpdateNotice) {
    window.kindyrAPI.updater.showUpdateNotice().catch(()=>{})
  } else if (window.kindyrAPI?.updater?.checkForUpdates) {
    window.kindyrAPI.updater.checkForUpdates().catch(()=>{})
  }
}
if (window.kindyrAPI?.updater?.onUpdateAvailable) {
  window.kindyrAPI.updater.onUpdateAvailable((info) => {
    const btn = document.getElementById('topnav-update-btn')
    const verEl = document.getElementById('topnav-update-ver')
    if (btn) {
      btn.style.display = 'inline-flex'
      if (verEl && info && info.version) verEl.textContent = 'v' + String(info.version).replace(/^[vV]/,'')
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  initKindyrSelects()
  await loadSettings()
  loadAccounts()
  loadSidebarState()
  // Mostrar botón actualizar si ya hay update pendiente
  if (window.kindyrAPI?.updater?.getLastUpdateInfo) {
    try {
      const info = await window.kindyrAPI.updater.getLastUpdateInfo()
      if (info && info.version) {
        const btn = document.getElementById('topnav-update-btn')
        const verEl = document.getElementById('topnav-update-ver')
        if (btn) {
          btn.style.display = 'inline-flex'
          if (verEl) verEl.textContent = 'v' + String(info.version).replace(/^[vV]/,'')
        }
      }
    } catch {}
  }
})
