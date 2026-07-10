import { describe, it, expect } from 'vitest';
import { loadDom } from './helpers/loadDom.js';

describe('toggleFaq', () => {
  it('opens a closed FAQ item', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const btn = document.querySelector('.faq-item .faq-q');
    const item = btn.closest('.faq-item');

    expect(item.classList.contains('open')).toBe(false);
    dom.window.toggleFaq(btn);
    expect(item.classList.contains('open')).toBe(true);
  });

  it('closes an already-open FAQ item (accordion toggle)', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const btn = document.querySelector('.faq-item .faq-q');
    const item = btn.closest('.faq-item');

    dom.window.toggleFaq(btn);
    dom.window.toggleFaq(btn);
    expect(item.classList.contains('open')).toBe(false);
  });

  it('only ever keeps a single item open at a time', () => {
    const dom = loadDom();
    const { document } = dom.window;
    const buttons = document.querySelectorAll('.faq-item .faq-q');
    expect(buttons.length).toBeGreaterThan(1);

    const firstItem = buttons[0].closest('.faq-item');
    const secondItem = buttons[1].closest('.faq-item');

    dom.window.toggleFaq(buttons[0]);
    expect(firstItem.classList.contains('open')).toBe(true);

    dom.window.toggleFaq(buttons[1]);
    expect(secondItem.classList.contains('open')).toBe(true);
    expect(firstItem.classList.contains('open')).toBe(false);

    const openCount = document.querySelectorAll('.faq-item.open').length;
    expect(openCount).toBe(1);
  });
});
