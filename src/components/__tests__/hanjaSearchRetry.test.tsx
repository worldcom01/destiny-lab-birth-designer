// @vitest-environment jsdom
// R4 audit A2: a failed lazy dictionary load is not cached forever; explicit retry recovers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const calls = { n: 0, failFirst: true };
vi.mock('@/lib/hanjaDictionary', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/hanjaDictionary')>();
  return {
    ...real,
    getHanjaDictionary: () => {
      calls.n++;
      if (calls.failFirst && calls.n === 1) throw new Error('chunk load failed (simulated)');
      return real.getHanjaDictionary();
    },
  };
});
const { default: HanjaSearchPanel } = await import('@/components/HanjaSearchPanel');

afterEach(cleanup);

describe('lazy dictionary load recovery', () => {
  it('shows a recoverable error, does not retry by itself, and loads on explicit retry', async () => {
    render(<HanjaSearchPanel hangul="현" onChoose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: '한자 검색' }), { target: { value: '鉉' } });
    const retry = await screen.findByTestId('hanja-search-retry');
    expect(screen.getByTestId('hanja-search-status').textContent).toContain('불러오지 못했습니다');
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(calls.n).toBe(1); // no automatic retry loop
    fireEvent.click(retry);
    await screen.findByTestId('hanja-search-results', {}, { timeout: 15000 });
    expect(calls.n).toBe(2);
    expect(document.querySelector('[data-result="鉉"]')).toBeTruthy();
    expect(screen.queryByTestId('hanja-search-retry')).toBeNull();
  }, 60000);

  it('a panel unmounted while loading does not update state or throw', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<HanjaSearchPanel hangul="현" onChoose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: '한자 검색' }), { target: { value: '현' } });
    unmount();
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    await waitFor(() => expect(calls.n).toBeGreaterThanOrEqual(2));
  });
});
