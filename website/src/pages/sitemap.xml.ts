import type { APIRoute } from 'astro';
import { languages } from '../i18n/ui';

// Sitemap generado en el build a partir de las páginas reales de src/pages/[locale]/.
// Agregar una página nueva en esa carpeta la incluye sola, con sus hreflang recíprocos.
// Sustituye al antiguo public/sitemap.xml escrito a mano.
const localizedPages = import.meta.glob('./**/*.astro');

const locales = Object.keys(languages);
const defaultLocale = 'en'; // x-default coincide con BaseLayout (hreflang x-default -> /en/)

// './[locale]/index.astro' -> '' · './[locale]/descargar.astro' -> 'descargar/'
const routes = Object.keys(localizedPages)
  .filter((file) => file.startsWith('./[locale]/'))
  .map((file) => file.replace('./[locale]/', '').replace(/\.astro$/, '').replace(/(^|\/)index$/, ''))
  .map((route) => (route === '' ? '' : `${route.replace(/\/$/, '')}/`))
  .sort((a, b) => a.length - b.length || a.localeCompare(b));

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://kindyrlauncher.pages.dev');
  const url = (locale: string, route: string) => new URL(`/${locale}/${route}`, origin).toString();

  const entries = routes.flatMap((route) =>
    locales.map((locale) => {
      const alternates = [
        ...locales.map((code) => `<xhtml:link rel="alternate" hreflang="${code}" href="${url(code, route)}"/>`),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${url(defaultLocale, route)}"/>`,
      ].join('');
      return `<url><loc>${url(locale, route)}</loc>${alternates}</url>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
