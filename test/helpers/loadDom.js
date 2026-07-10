import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = resolve(__dirname, '..', '..', 'index.html');

/**
 * Loads index.html into a fresh jsdom instance, executing its inline scripts.
 *
 * The page's inline script instantiates an IntersectionObserver and registers a
 * scroll listener at parse time, neither of which jsdom implements. We stub
 * IntersectionObserver in `beforeParse` so the scripts run to completion, and we
 * can optionally seed localStorage before the <head> theme bootstrap runs.
 *
 * @param {object} [options]
 * @param {Record<string,string>} [options.storage] entries written to
 *   localStorage before any script executes (used to test the theme bootstrap).
 * @returns {import('jsdom').JSDOM}
 */
export function loadDom({ storage } = {}) {
  const html = readFileSync(INDEX_PATH, 'utf8');

  return new JSDOM(html, {
    url: 'https://loryq.example/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      class IntersectionObserverStub {
        constructor(callback) {
          this.callback = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
      window.IntersectionObserver = IntersectionObserverStub;

      if (storage) {
        for (const [key, value] of Object.entries(storage)) {
          window.localStorage.setItem(key, value);
        }
      }
    },
  });
}

/**
 * Reads a top-level lexical binding (const/let) from the loaded document.
 * Function declarations are exposed directly on `window`; const/let bindings are
 * not, so we reach them via indirect eval in the global scope.
 */
export function readGlobal(dom, name) {
  return dom.window.eval(name);
}
