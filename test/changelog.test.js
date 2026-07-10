import { describe, it, expect } from 'vitest';
import { loadDom, readGlobal } from './helpers/loadDom.js';

describe('toggleChangelog', () => {
  it('expands a collapsed entry and swaps its classes', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const btn = document.querySelector('.cl-more-btn');
    const entry = btn.closest('.cl-entry');

    expect(entry.classList.contains('is-collapsed')).toBe(true);
    expect(entry.classList.contains('expanded')).toBe(false);

    dom.window.toggleChangelog(btn);

    expect(entry.classList.contains('expanded')).toBe(true);
    expect(entry.classList.contains('is-collapsed')).toBe(false);
  });

  it('collapses an expanded entry again', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const btn = document.querySelector('.cl-more-btn');
    const entry = btn.closest('.cl-entry');

    dom.window.toggleChangelog(btn);
    dom.window.toggleChangelog(btn);

    expect(entry.classList.contains('expanded')).toBe(false);
    expect(entry.classList.contains('is-collapsed')).toBe(true);
  });

  it('updates the button label to the expanded/collapsed wording', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const translations = readGlobal(dom, 'translations');
    const btn = document.querySelector('.cl-more-btn');

    dom.window.toggleChangelog(btn);
    expect(btn.textContent).toBe(translations.es['cl.less']);

    dom.window.toggleChangelog(btn);
    expect(btn.textContent).toBe(translations.es['cl.more']);
  });

  it('is a no-op when the button is not inside a changelog entry', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const orphan = document.createElement('button');
    expect(() => dom.window.toggleChangelog(orphan)).not.toThrow();
  });
});

describe('updateChangelogButtons', () => {
  it('localises every changelog button when the language changes', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const translations = readGlobal(dom, 'translations');

    dom.window.applyLang('en');

    document.querySelectorAll('.cl-more-btn').forEach((btn) => {
      const entry = btn.closest('.cl-entry');
      const expected = entry.classList.contains('expanded')
        ? translations.en['cl.less']
        : translations.en['cl.more'];
      expect(btn.textContent).toBe(expected);
    });
  });
});
