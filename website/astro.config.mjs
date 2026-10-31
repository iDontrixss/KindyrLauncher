// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://kindyrlauncher.pages.dev',
  output: 'static',
  // Sin bloque i18n a propósito: los idiomas los rutea [locale]/ + getLangFromUrl.
  // Con i18n + prefixDefaultLocale:false, el dev server devuelve 404 en /es
  // (el idioma por defecto no admite prefijo), aunque el build salga bien.
});
