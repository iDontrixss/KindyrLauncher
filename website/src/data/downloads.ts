// Archivos de la release v0.2.0-beta.2 (github.com/iDontrixss/KindyrLauncher/releases).
// Al publicar una versión nueva, actualizar VERSION y los nombres de archivo.
export const VERSION = '0.2.0-beta.2';
const RELEASE_BASE = `https://github.com/iDontrixss/KindyrLauncher/releases/download/v${VERSION}`;

export const RELEASES_URL = 'https://github.com/iDontrixss/KindyrLauncher/releases';

export const downloads = {
  windows: {
    label: 'Windows',
    detail: 'Instalador NSIS x64',
    file: `Kindyr-Launcher-Setup-${VERSION}.exe`,
    url: `${RELEASE_BASE}/Kindyr-Launcher-Setup-${VERSION}.exe`,
  },
  linux: {
    label: 'Linux',
    detail: 'AppImage x64',
    file: `Kindyr-Launcher-${VERSION}.AppImage`,
    url: `${RELEASE_BASE}/Kindyr-Launcher-${VERSION}.AppImage`,
  },
} as const;

export type OS = keyof typeof downloads;
