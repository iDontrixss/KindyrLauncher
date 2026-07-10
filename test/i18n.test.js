import { describe, it, expect } from 'vitest';
import { loadDom, readGlobal } from './helpers/loadDom.js';

describe('translations catalogue', () => {
  it('exposes exactly the "es" and "en" locales', () => {
    const translations = readGlobal(loadDom(), 'translations');
    expect(Object.keys(translations).sort()).toEqual(['en', 'es']);
  });

  it('has identical key sets across "es" and "en" (no missing/extra strings)', () => {
    const translations = readGlobal(loadDom(), 'translations');
    const esKeys = Object.keys(translations.es).sort();
    const enKeys = Object.keys(translations.en).sort();

    const missingInEn = esKeys.filter((k) => !(k in translations.en));
    const missingInEs = enKeys.filter((k) => !(k in translations.es));

    expect(missingInEn).toEqual([]);
    expect(missingInEs).toEqual([]);
    expect(esKeys).toEqual(enKeys);
  });

  it('has no empty translation values', () => {
    const translations = readGlobal(loadDom(), 'translations');
    for (const locale of ['es', 'en']) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(typeof value, `${locale}.${key}`).toBe('string');
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('provides a translation for every [data-i18n] / [data-i18n-html] key used in the markup', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const translations = readGlobal(dom, 'translations');

    const usedKeys = new Set();
    document.querySelectorAll('[data-i18n]').forEach((el) => usedKeys.add(el.getAttribute('data-i18n')));
    document
      .querySelectorAll('[data-i18n-html]')
      .forEach((el) => usedKeys.add(el.getAttribute('data-i18n-html')));

    const missing = [...usedKeys].filter(
      (key) => !(key in translations.es) || !(key in translations.en),
    );
    expect(missing).toEqual([]);
  });
});

describe('applyLang', () => {
  it('translates text nodes and sets the document language to English', () => {
    const dom = loadDom();
    const { window } = dom;
    const { document } = window;
    const translations = readGlobal(dom, 'translations');

    window.applyLang('en');

    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(readGlobal(dom, 'currentLang')).toBe('en');

    const sample = document.querySelector('[data-i18n="nav.features"]');
    expect(sample.textContent).toBe(translations.en['nav.features']);
  });

  it('renders [data-i18n-html] entries as HTML (not escaped text)', () => {
    const dom = loadDom();
    const { window } = dom;
    const { document } = window;
    const translations = readGlobal(dom, 'translations');

    window.applyLang('en');

    const htmlEl = document.querySelector('[data-i18n-html]');
    const key = htmlEl.getAttribute('data-i18n-html');

    // Compare against a scratch element so both sides are serialised the same
    // way (e.g. the DOM normalises the source's "<br/>" to "<br>").
    const scratch = document.createElement('div');
    scratch.innerHTML = translations.en[key];
    expect(htmlEl.innerHTML).toBe(scratch.innerHTML);
    // The markup must actually be parsed as HTML, not inserted as literal text.
    expect(htmlEl.querySelector('em')).not.toBeNull();
  });

  it('sets the language button label to the opposite language', () => {
    const dom = loadDom();
    const { window } = dom;
    const langBtn = window.document.getElementById('langBtn');

    window.applyLang('es');
    expect(langBtn.textContent).toBe('EN');

    window.applyLang('en');
    expect(langBtn.textContent).toBe('ES');
  });
});

describe('toggleLang', () => {
  it('switches between es and en', () => {
    const dom = loadDom();
    const { window } = dom;

    window.applyLang('es');
    window.toggleLang();
    expect(readGlobal(dom, 'currentLang')).toBe('en');

    window.toggleLang();
    expect(readGlobal(dom, 'currentLang')).toBe('es');
  });
});
