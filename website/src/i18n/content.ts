export type Lang = 'es' | 'en';

export const languages: Record<Lang, string> = {
  es: 'Español',
  en: 'English',
};

export const defaultLang: Lang = 'es';

export const routes: Record<Lang, string> = {
  es: '/',
  en: '/en/',
};

interface Benefit {
  number: string;
  tag: string;
  title: string;
  text: string;
  icon: string;
  className: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface Content {
  htmlLang: string;
  ogLocale: string;
  meta: { title: string; description: string };
  featureList: string[];
  skip: string;
  nav: { funciones: string; contenido: string; comparativa: string; faq: string; descargar: string; github: string };
  aria: {
    brand: string;
    mainNav: string;
    mobileNav: string;
    heroProduct: string;
    discover: string;
    instance: string;
    compat: string;
    features: string;
    comparison: string;
    themeToggle: string;
    openMenu: string;
  };
  hero: {
    eyebrow: string;
    titleTop: string;
    titleBottom: string;
    lead: string;
    download: string;
    github: string;
    meta: string[];
    tagReady: string;
    stickerTop: string;
    stickerBottom: string;
    imgAlt: string;
  };
  benefitsSection: { kicker: string; titleTop: string; titleBottom: string; text: string };
  benefits: Benefit[];
  benefitStack: { strong: string; small: string }[];
  discover: {
    kicker: string;
    titleTop: string;
    titleBottom: string;
    text: string;
    points: { strong: string; text: string }[];
    imgAlt: string;
  };
  instances: {
    kicker: string;
    titleTop: string;
    titleBottom: string;
    text: string;
    statements: { title: string; text: string }[];
    imgAlt: string;
  };
  why: {
    kicker: string;
    titleTop: string;
    titleBottom: string;
    text: string;
    head: [string, string, string];
    rows: [string, string, string][];
  };
  values: { label: string; titleTop: string; titleBottom: string; text: string; link?: string }[];
  faqSection: { kicker: string; titleTop: string; titleBottom: string };
  faq: FaqItem[];
  download: {
    eyebrow: string;
    titleTop: string;
    titleBottom: string;
    text: string;
    download: string;
    code: string;
    small: string;
    badge: string;
  };
  footer: { tagline: string; download: string; github: string; legal: string };
}

export const content: Record<Lang, Content> = {
  es: {
    htmlLang: 'es',
    ogLocale: 'es_UY',
    meta: {
      title: 'Kindyr — El launcher de Minecraft para jugar a tu manera',
      description:
        'Creá instancias, instalá mods y modpacks desde Modrinth, importá .mrpack y organizá Minecraft desde un launcher open source, claro y sin anuncios.',
    },
    featureList: [
      'Gestión de instancias de Minecraft',
      'Integración con Modrinth',
      'Importación de paquetes .mrpack',
      'Compatibilidad con múltiples loaders',
      'Gestión de cuentas Microsoft',
    ],
    skip: 'Saltar al contenido',
    nav: {
      funciones: 'Funciones',
      contenido: 'Contenido',
      comparativa: 'Por qué Kindyr',
      faq: 'FAQ',
      descargar: 'DESCARGAR',
      github: 'GitHub',
    },
    aria: {
      brand: 'Kindyr, volver al inicio',
      mainNav: 'Navegación principal',
      mobileNav: 'Navegación móvil',
      heroProduct: 'Vista de la interfaz de Kindyr',
      discover: 'Explorador de contenido de Modrinth en Kindyr',
      instance: 'Configuración de una instancia en Kindyr',
      compat: 'Compatibilidad destacada',
      features: 'Características principales',
      comparison: 'Comparación entre Kindyr y la configuración manual',
      themeToggle: 'Cambiar entre tema claro y oscuro',
      openMenu: 'Abrir menú',
    },
    hero: {
      eyebrow: 'LAUNCHER DE MINECRAFT · OPEN SOURCE',
      titleTop: 'TU MINECRAFT.',
      titleBottom: 'LISTO PARA JUGAR.',
      lead: 'Creá instancias, instalá mods y modpacks, cambiá de versión y entrá al juego desde un solo lugar. Sin anuncios y sin pelearte con carpetas.',
      download: 'DESCARGAR KINDYR',
      github: 'VER EN GITHUB',
      meta: ['WINDOWS + LINUX', 'SIN PUBLICIDAD', 'CÓDIGO ABIERTO'],
      tagReady: 'LISTO',
      stickerTop: 'TODO TU JUEGO.',
      stickerBottom: 'UN SOLO LUGAR.',
      imgAlt: 'Pantalla de inicio de Kindyr: instalación recomendada, acciones rápidas e instancias recientes',
    },
    benefitsSection: {
      kicker: 'TODO EN KINDYR',
      titleTop: 'MENOS CONFIGURAR.',
      titleBottom: 'MÁS JUGAR.',
      text: 'Las herramientas que usás antes de entrar a Minecraft, conectadas dentro de la misma experiencia.',
    },
    benefits: [
      {
        number: '01',
        tag: 'INSTANCIAS',
        title: 'Un espacio para cada forma de jugar.',
        text: 'Separá versiones, loaders, mundos y mods. Probá algo nuevo sin tocar la partida que ya funciona.',
        icon: 'layers',
        className: 'benefit-card benefit-card-wide benefit-blue',
      },
      {
        number: '02',
        tag: 'MODRINTH',
        title: 'Encontrá e instalá contenido desde Kindyr.',
        text: 'Buscá mods y modpacks sin saltar entre el navegador, descargas y carpetas.',
        icon: 'compass',
        className: 'benefit-card benefit-green',
      },
      {
        number: '03',
        tag: '.MRPACK',
        title: 'Importá un modpack y empezá.',
        text: 'Convertí un paquete de Modrinth en una instancia organizada y lista para configurar.',
        icon: 'package',
        className: 'benefit-card benefit-coral',
      },
      {
        number: '04',
        tag: 'CUENTAS',
        title: 'Tus perfiles de Microsoft, a mano.',
        text: 'Cambiá de cuenta sin perder el contexto de lo que estabas preparando.',
        icon: 'user',
        className: 'benefit-card benefit-yellow',
      },
      {
        number: '05',
        tag: 'OPEN SOURCE',
        title: 'Sin anuncios. Sin caja negra.',
        text: 'Kindyr es un proyecto abierto: podés revisar el código, seguir los cambios y reportar problemas.',
        icon: 'code',
        className: 'benefit-card benefit-white',
      },
    ],
    benefitStack: [
      { strong: 'Vanilla limpio', small: '1.21.4 · VANILLA' },
      { strong: 'Keo Optimized', small: '1.21.4 · FABRIC' },
      { strong: 'Creativo', small: '1.20.1 · FORGE' },
    ],
    discover: {
      kicker: 'CONTENIDO INTEGRADO',
      titleTop: 'ENCONTRÁ TU PRÓXIMA',
      titleBottom: 'EXPERIENCIA.',
      text: 'Explorá mods y modpacks de Modrinth desde el launcher. Elegí una instancia y mantené cada descarga donde corresponde.',
      points: [
        { strong: 'Búsqueda integrada', text: 'Encontrá contenido sin abrir diez pestañas.' },
        { strong: 'Contexto de instancia', text: 'Sabés para qué versión y loader estás instalando.' },
        { strong: 'Importación .mrpack', text: 'Pasá de un paquete a una instancia organizada.' },
      ],
      imgAlt: 'Sección Descubrir de Kindyr explorando proyectos de Modrinth: mods, modpacks y shaders',
    },
    instances: {
      kicker: 'INSTANCIAS',
      titleTop: 'CADA PARTIDA,',
      titleBottom: 'A SU MANERA.',
      text: 'Tené una instancia Vanilla, otra con Fabric y otra para probar un modpack. Cada una conserva su versión, loader, contenido y configuración.',
      statements: [
        { title: 'SIN CONFLICTOS', text: 'Lo que instalás en una instancia no desarma las demás.' },
        { title: 'SIN ADIVINAR', text: 'Siempre ves qué perfil estás editando y dónde se guardan los cambios.' },
      ],
      imgAlt: 'Instancia Minecraft 26.2 Fabric en Kindyr con centro de control y mods activos',
    },
    why: {
      kicker: 'POR QUÉ KINDYR',
      titleTop: 'DEL ARCHIVO SUELTO',
      titleBottom: 'A TODO ORGANIZADO.',
      text: 'Kindyr reemplaza el recorrido de descargar, mover, instalar y volver a configurar por una experiencia conectada.',
      head: ['TAREA', 'CON KINDYR', 'CONFIGURACIÓN MANUAL'],
      rows: [
        ['Instancias separadas', 'Incluido', 'Carpetas y perfiles manuales'],
        ['Mods y modpacks', 'Dentro del launcher', 'Navegador + descargas + mover archivos'],
        ['Importación .mrpack', 'Flujo directo', 'Varios pasos y configuración'],
        ['Loaders', 'Desde la creación de instancia', 'Instaladores por separado'],
        ['Código abierto', 'Sí', 'Depende de cada herramienta'],
      ],
    },
    values: [
      {
        label: '01 / OPEN SOURCE',
        titleTop: 'EL CÓDIGO',
        titleBottom: 'ESTÁ A LA VISTA.',
        text: 'Revisá cómo funciona, seguí el desarrollo y participá desde GitHub.',
        link: 'ABRIR REPOSITORIO ↗',
      },
      {
        label: '02 / EXPERIENCIA LIMPIA',
        titleTop: 'SIN ANUNCIOS.',
        titleBottom: 'SIN DISTRACCIONES.',
        text: 'El launcher se concentra en tus instancias, tu contenido y el botón de jugar.',
      },
      {
        label: '03 / MULTIPLATAFORMA',
        titleTop: 'WINDOWS',
        titleBottom: 'Y LINUX.',
        text: 'Una misma propuesta visual y funcional para los dos sistemas principales del proyecto.',
      },
    ],
    faqSection: {
      kicker: 'PREGUNTAS FRECUENTES',
      titleTop: 'LO IMPORTANTE,',
      titleBottom: 'SIN VUELTAS.',
    },
    faq: [
      {
        question: '¿Qué puedo hacer con Kindyr?',
        answer:
          'Crear y administrar instancias de Minecraft, trabajar con diferentes versiones y loaders, explorar contenido de Modrinth, importar paquetes .mrpack y gestionar cuentas desde una sola aplicación.',
      },
      {
        question: '¿Qué loaders contempla?',
        answer:
          'Kindyr está pensado para trabajar con experiencias Vanilla y con loaders como Fabric, Forge, NeoForge y Quilt. La compatibilidad exacta depende de cada versión y del estado de desarrollo.',
      },
      {
        question: '¿Kindyr tiene anuncios?',
        answer: 'No. La propuesta del launcher es mantener una experiencia limpia, directa y sin publicidad integrada.',
      },
      {
        question: '¿Es gratuito y open source?',
        answer: 'Sí. El código del proyecto está disponible públicamente en GitHub, junto con los avances, reportes y releases.',
      },
    ],
    download: {
      eyebrow: 'EMPEZÁ TU PRÓXIMA PARTIDA',
      titleTop: 'DEJÁ DE ORDENAR',
      titleBottom: 'CARPETAS.',
      text: 'Descargá Kindyr y prepará Minecraft desde un launcher diseñado para mantener todo en su lugar.',
      download: 'DESCARGAR KINDYR',
      code: 'VER EL CÓDIGO ↗',
      small: 'Proyecto independiente. No afiliado con Mojang Studios ni Microsoft.',
      badge: 'OPEN SOURCE',
    },
    footer: {
      tagline: 'Tu Minecraft. Listo para jugar.',
      download: 'DESCARGAR ↗',
      github: 'GITHUB ↗',
      legal: 'Kindyr. Minecraft es una marca de Microsoft. Kindyr no es un producto oficial.',
    },
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    meta: {
      title: 'Kindyr — The Minecraft launcher for playing your way',
      description:
        'Create instances, install mods and modpacks from Modrinth, import .mrpack files and organize Minecraft from an open source launcher that is clean and ad-free.',
    },
    featureList: [
      'Minecraft instance management',
      'Modrinth integration',
      '.mrpack package import',
      'Support for multiple loaders',
      'Microsoft account management',
    ],
    skip: 'Skip to content',
    nav: {
      funciones: 'Features',
      contenido: 'Content',
      comparativa: 'Why Kindyr',
      faq: 'FAQ',
      descargar: 'DOWNLOAD',
      github: 'GitHub',
    },
    aria: {
      brand: 'Kindyr, back to top',
      mainNav: 'Main navigation',
      mobileNav: 'Mobile navigation',
      heroProduct: 'View of the Kindyr interface',
      discover: 'Modrinth content browser in Kindyr',
      instance: 'Instance settings in Kindyr',
      compat: 'Featured compatibility',
      features: 'Key features',
      comparison: 'Comparison between Kindyr and manual setup',
      themeToggle: 'Toggle light and dark theme',
      openMenu: 'Open menu',
    },
    hero: {
      eyebrow: 'MINECRAFT LAUNCHER · OPEN SOURCE',
      titleTop: 'YOUR MINECRAFT.',
      titleBottom: 'READY TO PLAY.',
      lead: 'Create instances, install mods and modpacks, switch versions and jump into the game from a single place. No ads and no wrestling with folders.',
      download: 'DOWNLOAD KINDYR',
      github: 'VIEW ON GITHUB',
      meta: ['WINDOWS + LINUX', 'AD-FREE', 'OPEN SOURCE'],
      tagReady: 'READY',
      stickerTop: 'YOUR WHOLE GAME.',
      stickerBottom: 'ONE PLACE.',
      imgAlt: 'Kindyr home screen: recommended install, quick actions and recent instances',
    },
    benefitsSection: {
      kicker: 'ALL IN KINDYR',
      titleTop: 'LESS SETUP.',
      titleBottom: 'MORE PLAYING.',
      text: 'The tools you use before jumping into Minecraft, connected inside the same experience.',
    },
    benefits: [
      {
        number: '01',
        tag: 'INSTANCES',
        title: 'A space for every way you play.',
        text: 'Separate versions, loaders, worlds and mods. Try something new without touching the setup that already works.',
        icon: 'layers',
        className: 'benefit-card benefit-card-wide benefit-blue',
      },
      {
        number: '02',
        tag: 'MODRINTH',
        title: 'Find and install content from Kindyr.',
        text: 'Search for mods and modpacks without jumping between the browser, downloads and folders.',
        icon: 'compass',
        className: 'benefit-card benefit-green',
      },
      {
        number: '03',
        tag: '.MRPACK',
        title: 'Import a modpack and get going.',
        text: 'Turn a Modrinth package into an organized instance that is ready to configure.',
        icon: 'package',
        className: 'benefit-card benefit-coral',
      },
      {
        number: '04',
        tag: 'ACCOUNTS',
        title: 'Your Microsoft profiles, on hand.',
        text: 'Switch accounts without losing track of what you were setting up.',
        icon: 'user',
        className: 'benefit-card benefit-yellow',
      },
      {
        number: '05',
        tag: 'OPEN SOURCE',
        title: 'No ads. No black box.',
        text: 'Kindyr is an open project: you can review the code, follow the changes and report issues.',
        icon: 'code',
        className: 'benefit-card benefit-white',
      },
    ],
    benefitStack: [
      { strong: 'Clean Vanilla', small: '1.21.4 · VANILLA' },
      { strong: 'Keo Optimized', small: '1.21.4 · FABRIC' },
      { strong: 'Creative', small: '1.20.1 · FORGE' },
    ],
    discover: {
      kicker: 'INTEGRATED CONTENT',
      titleTop: 'FIND YOUR NEXT',
      titleBottom: 'EXPERIENCE.',
      text: 'Browse mods and modpacks from Modrinth inside the launcher. Pick an instance and keep every download where it belongs.',
      points: [
        { strong: 'Built-in search', text: 'Find content without opening ten tabs.' },
        { strong: 'Instance context', text: 'You know which version and loader you are installing for.' },
        { strong: '.mrpack import', text: 'Go from a package to an organized instance.' },
      ],
      imgAlt: "Kindyr's Discover section browsing Modrinth projects: mods, modpacks and shaders",
    },
    instances: {
      kicker: 'INSTANCES',
      titleTop: 'EVERY PLAYTHROUGH,',
      titleBottom: 'ITS OWN WAY.',
      text: 'Keep a Vanilla instance, another with Fabric and one to try a modpack. Each keeps its own version, loader, content and settings.',
      statements: [
        { title: 'NO CONFLICTS', text: 'What you install in one instance does not break the others.' },
        { title: 'NO GUESSING', text: 'You always see which profile you are editing and where changes are saved.' },
      ],
      imgAlt: 'Minecraft 26.2 Fabric instance in Kindyr with a control center and active mods',
    },
    why: {
      kicker: 'WHY KINDYR',
      titleTop: 'FROM LOOSE FILES',
      titleBottom: 'TO FULLY ORGANIZED.',
      text: 'Kindyr replaces the download, move, install and reconfigure routine with one connected experience.',
      head: ['TASK', 'WITH KINDYR', 'MANUAL SETUP'],
      rows: [
        ['Separate instances', 'Included', 'Manual folders and profiles'],
        ['Mods and modpacks', 'Inside the launcher', 'Browser + downloads + moving files'],
        ['.mrpack import', 'Direct flow', 'Several steps and setup'],
        ['Loaders', 'From instance creation', 'Separate installers'],
        ['Open source', 'Yes', 'Depends on each tool'],
      ],
    },
    values: [
      {
        label: '01 / OPEN SOURCE',
        titleTop: 'THE CODE',
        titleBottom: 'IS IN THE OPEN.',
        text: 'Review how it works, follow development and take part on GitHub.',
        link: 'OPEN REPOSITORY ↗',
      },
      {
        label: '02 / CLEAN EXPERIENCE',
        titleTop: 'NO ADS.',
        titleBottom: 'NO DISTRACTIONS.',
        text: 'The launcher focuses on your instances, your content and the play button.',
      },
      {
        label: '03 / CROSS-PLATFORM',
        titleTop: 'WINDOWS',
        titleBottom: 'AND LINUX.',
        text: 'The same visual and functional experience for the two main systems of the project.',
      },
    ],
    faqSection: {
      kicker: 'FREQUENTLY ASKED',
      titleTop: 'WHAT MATTERS,',
      titleBottom: 'NO FLUFF.',
    },
    faq: [
      {
        question: 'What can I do with Kindyr?',
        answer:
          'Create and manage Minecraft instances, work with different versions and loaders, browse Modrinth content, import .mrpack packages and manage accounts from a single app.',
      },
      {
        question: 'Which loaders does it support?',
        answer:
          'Kindyr is designed to work with Vanilla experiences and loaders like Fabric, Forge, NeoForge and Quilt. Exact compatibility depends on each version and the development state.',
      },
      {
        question: 'Does Kindyr have ads?',
        answer: 'No. The launcher aims to keep a clean, direct experience with no built-in advertising.',
      },
      {
        question: 'Is it free and open source?',
        answer: 'Yes. The project code is publicly available on GitHub, along with progress, reports and releases.',
      },
    ],
    download: {
      eyebrow: 'START YOUR NEXT SESSION',
      titleTop: 'STOP SORTING',
      titleBottom: 'FOLDERS.',
      text: 'Download Kindyr and set up Minecraft from a launcher built to keep everything in its place.',
      download: 'DOWNLOAD KINDYR',
      code: 'VIEW THE CODE ↗',
      small: 'Independent project. Not affiliated with Mojang Studios or Microsoft.',
      badge: 'OPEN SOURCE',
    },
    footer: {
      tagline: 'Your Minecraft. Ready to play.',
      download: 'DOWNLOAD ↗',
      github: 'GITHUB ↗',
      legal: 'Kindyr. Minecraft is a trademark of Microsoft. Kindyr is not an official product.',
    },
  },
};
