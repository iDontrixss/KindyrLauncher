// Genera public/previews/<vista>.webp a partir de las vistas del launcher
// que hoy se renderizan como iframes en LauncherMockup.astro.
//
// Uso (desde la carpeta website/):
//   npm i -D playwright
//   npx playwright install chromium
//   node scripts/snap-previews.mjs
//
// Después de generarlas, LauncherMockup usa <img> automáticamente
// (si borras public/previews/, vuelve a los iframes).

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp'; // ya viene como dependencia de Astro
import { dev } from 'astro';

const VIEWS = ['home', 'instances', 'discover', 'import', 'accounts', 'skins', 'settings', 'migrate'];
const PORT = 4399;
const OUT = new URL('../public/previews/', import.meta.url);

// Fuerza los iframes en LauncherMockup mientras se capturan.
process.env.PREVIEW_IFRAME = '1';

await mkdir(OUT, { recursive: true });

const server = await dev({ root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), server: { port: PORT } });
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  for (const view of VIEWS) {
    const srcdoc = await page.locator(`iframe.launcher-preview--${view}`).first().getAttribute('srcdoc');
    if (!srcdoc) {
      console.warn(`✗ ${view}: no se encontró el iframe (¿PREVIEW_IFRAME no llegó a la página?)`);
      continue;
    }

    // iframe nuevo, sin escalado ni transformaciones, a 1280x720 y por encima de todo
    await page.evaluate((html) => new Promise((resolve) => {
      document.getElementById('__snap')?.remove();
      const frame = document.createElement('iframe');
      frame.id = '__snap';
      frame.style.cssText = 'position:fixed;top:0;left:0;width:1280px;height:720px;border:0;z-index:2147483647;background:#1a1a1a';
      frame.addEventListener('load', async () => {
        try { await frame.contentDocument.fonts.ready; } catch {}
        setTimeout(resolve, 500);
      });
      frame.srcdoc = html;
      document.body.appendChild(frame);
    }), srcdoc);

    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
    const file = new URL(`${view}.webp`, OUT);
    await sharp(png).resize(960, 540).webp({ quality: 82 }).toFile(file.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    console.log(`✓ ${view}.webp`);
  }
} finally {
  await browser.close();
  await server.stop();
}
