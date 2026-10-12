# Kindyr Website

Sitio oficial de Kindyr, construido con Astro y publicado mediante Cloudflare Pages.

## Desarrollo local

```sh
npm ci
npm run dev
```

Astro sirve el proyecto en `http://localhost:4321`.

## Producción

```sh
npm run build
```

Cloudflare Pages usa esta configuración:

- Directorio raíz: `website`
- Comando: `npm run build`
- Salida: `dist`
- Rama de producción: `main`

El resultado es un sitio estático; no necesita Functions ni bindings de Cloudflare.
