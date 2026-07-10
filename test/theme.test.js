import { describe, it, expect } from 'vitest';
import { loadDom, readGlobal } from './helpers/loadDom.js';

describe('theme bootstrap (inline <head> script)', () => {
  it('defaults to dark when nothing is stored', () => {
    const { document } = loadDom().window;
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('honours a stored "light" preference before paint', () => {
    const { document } = loadDom({ storage: { 'loryq-theme': 'light' } }).window;
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('honours a stored "dark" preference before paint', () => {
    const { document } = loadDom({ storage: { 'loryq-theme': 'dark' } }).window;
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to dark for an unrecognised stored value', () => {
    const { document } = loadDom({ storage: { 'loryq-theme': 'neon' } }).window;
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('applies "light", persists it, and updates currentTheme', () => {
    const dom = loadDom();
    const { window } = dom;
    window.applyTheme('light');

    expect(window.document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('loryq-theme')).toBe('light');
    expect(readGlobal(dom, 'currentTheme')).toBe('light');
  });

  it('coerces any non-"light" value to "dark"', () => {
    const dom = loadDom();
    const { window } = dom;
    window.applyTheme('purple');

    expect(window.document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('loryq-theme')).toBe('dark');
    expect(readGlobal(dom, 'currentTheme')).toBe('dark');
  });

  it('updates the theme button aria-label/title to describe the next theme', () => {
    const dom = loadDom();
    const { window } = dom;
    const btn = window.document.getElementById('themeBtn');

    window.applyTheme('dark');
    expect(btn.getAttribute('aria-label')).toBe('Cambiar a modo claro');
    expect(btn.getAttribute('title')).toBe('Cambiar a modo claro');

    window.applyTheme('light');
    expect(btn.getAttribute('aria-label')).toBe('Cambiar a modo oscuro');
    expect(btn.getAttribute('title')).toBe('Cambiar a modo oscuro');
  });
});

describe('toggleTheme', () => {
  it('flips dark -> light -> dark', () => {
    const dom = loadDom();
    const { window } = dom;

    window.applyTheme('dark');
    window.toggleTheme();
    expect(readGlobal(dom, 'currentTheme')).toBe('light');
    expect(window.document.documentElement.getAttribute('data-theme')).toBe('light');

    window.toggleTheme();
    expect(readGlobal(dom, 'currentTheme')).toBe('dark');
    expect(window.document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
