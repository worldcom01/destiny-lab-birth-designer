// @vitest-environment jsdom
// R4 G2 mobile hotfix: layout contracts of the Hanja search inside the picker on narrow screens.
// jsdom has no layout engine, so these tests pin the responsive class contracts; geometry
// (no horizontal overflow at 320/375/390 px) is checked in a real browser separately.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HanjaSearchPanel from '@/components/HanjaSearchPanel';
import { LEGACY_GLOSS_LABEL } from '@/lib/hanjaModel';

afterEach(cleanup);
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

describe('Hanja search mobile layout', () => {
  it('form controls are at least 16px below the sm breakpoint (no iOS focus zoom)', () => {
    render(<HanjaSearchPanel hangul="현" onChoose={vi.fn()} />);
    for (const el of [screen.getByRole('searchbox', { name: '한자 검색' }), screen.getByRole('combobox', { name: '검색 기준' })]) {
      const c = classes(el);
      expect(c).toContain('text-base');
      // smaller text only from the sm breakpoint up
      expect(c.filter(x => /^text-(xs|sm|\[)/.test(x))).toEqual([]);
    }
    expect(classes(screen.getByRole('combobox', { name: '검색 기준' }))).toContain('shrink-0');
  });

  it('result meanings wrap instead of being cut off, keeping the provenance label visible', async () => {
    render(<HanjaSearchPanel hangul="현" onChoose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: '한자 검색' }), { target: { value: '鉉' } });
    await screen.findByTestId('hanja-search-results', {}, { timeout: 15000 });
    const meaning = document.querySelector('[data-result="鉉"] [data-testid="hanja-result-meaning"]')!;
    expect(meaning.textContent).toContain(`(${LEGACY_GLOSS_LABEL})`);
    expect(classes(meaning)).not.toContain('truncate');
    expect(classes(meaning)).toContain('wrap-break-word');
  }, 60000);

  it('detail: glyph box keeps its size, text column and actions can shrink and wrap', async () => {
    render(<HanjaSearchPanel hangul="현" onChoose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: '한자 검색' }), { target: { value: '鉉' } });
    await screen.findByTestId('hanja-search-results', {}, { timeout: 15000 });
    fireEvent.click(document.querySelector('[data-result="鉉"]')!);
    const detail = await screen.findByTestId('hanja-search-detail');
    expect(detail.getAttribute('data-char')).toBe('鉉'); // character identity unchanged
    expect(classes(detail)).toContain('wrap-break-word');
    const glyph = [...detail.querySelectorAll('span')].find(s => s.textContent === '鉉' && classes(s).includes('w-20'))!;
    expect(classes(glyph)).toContain('shrink-0');
    const column = glyph.nextElementSibling!;
    expect(classes(column)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
    const actions = [...detail.querySelectorAll('button')];
    expect(actions.map(b => b.textContent)).toEqual(['목록으로', '鉉(으)로 선택']);
    for (const b of actions) expect(classes(b)).toContain('min-w-0');
  }, 60000);
});
