// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModeBInput } from '@/types';
import { analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput } from '@/lib/inputValidation';
import { HANJA_DB } from '@/data/hanjaDB';

// Integration tests of the real pages in jsdom (not a real browser).

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));

const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeAResults = (await import('@/app/mode-a/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;
const ModeAPage = (await import('@/app/mode-a/page')).default;
const ModeBPage = (await import('@/app/mode-b/page')).default;
const ModeCPage = (await import('@/app/mode-c/page')).default;

const MIN_MIN: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여',
  dolrimChar: '민', dolrimPosition: 'first', dolrimHanja: '敏', images: [], nameStyles: [],
};
const scopeOf = (i: ModeBInput) => {
  const v = validateModeBInput(i);
  if (!v.ok) throw new Error('fixture invalid');
  return analysisScope(v.value);
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('unrelated_key', 'keep-me');
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Row text of the 김민서 card (header shows name + nameAnalysis.hanja). */
async function minseoHanja(): Promise<string> {
  const heading = await screen.findByRole('heading', { name: '김민서' });
  return heading.parentElement!.textContent!;
}

describe('B01 page-level: stale stored Hanja vs current confirmed generational Hanja', () => {
  it('reproduction: legacy {"김민서":["珉",null]} does not override the newly confirmed 敏', async () => {
    localStorage.setItem('dlbd_mode_b_hanja', JSON.stringify({ version: 1, names: { 김민서: ['珉', null] } }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(MIN_MIN));
    render(<ModeBResults />);
    const text = await minseoHanja();
    expect(text).toContain('敏');
    expect(text).not.toContain('珉');
    // The unusable v1 key is removed; other keys are untouched.
    expect(localStorage.getItem('dlbd_mode_b_hanja')).toBeNull();
    expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
  });

  it('restores a selection for the same input, but not for a different analysis with the same name', async () => {
    const store = { version: 2, scopes: { [scopeOf(MIN_MIN)]: { updatedAt: 1, names: { 김민서: [null, '書'] } } } };
    localStorage.setItem('dlbd_mode_b_hanja_v2', JSON.stringify(store));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(MIN_MIN));
    const first = render(<ModeBResults />);
    expect(await minseoHanja()).toContain('敏書');
    first.unmount();

    localStorage.setItem('dlbd_mode_b', JSON.stringify({ ...MIN_MIN, birthDate: '2027-07-05' }));
    render(<ModeBResults />);
    const other = await minseoHanja();
    expect(other).toContain('敏瑞');
    expect(other).not.toContain('書');
  });
});

describe('H02 page-level: malformed preferences end in a recovery state', () => {
  it.each([
    ['Mode B nameStyles', 'dlbd_mode_b', { ...MIN_MIN, nameStyles: [{ toString: null }] }, ModeBResults],
    ['Mode B images', 'dlbd_mode_b', { ...MIN_MIN, images: ['constructor'] }, ModeBResults],
    ['Mode A images', 'dlbd_mode_a', {
      startDate: '2027-07-01', endDate: '2027-07-01', surname: '김', gender: '여', dolrimChar: '', dolrimPosition: 'auto',
      images: ['__proto__'], nameStyles: [], schedule: { providerConfirmed: true, timeRanges: [{ start: '09:00', end: '10:00' }], exactTimes: [] },
    }, ModeAResults],
    ['Mode C names', 'dlbd_mode_c', { birthDate: '2027-07-04', birthHour: 9, gender: '남', names: [{ toString: null }] }, ModeCResults],
  ] as const)('%s', async (_, key, value, Page) => {
    localStorage.setItem(key, JSON.stringify(value));
    render(<Page />);
    await screen.findByRole('alert');
    expect(screen.getByText(/유효하지 않아 분석하지 않았습니다/)).toBeTruthy();
    expect(screen.queryByText(/분석 중\.\.\./)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /입력 화면으로 돌아가기/ }));
    expect(push).toHaveBeenCalledWith(`/${key.replace('dlbd_', '').replace('_', '-')}`);
  });
});

describe('H04 page-level: input persistence failures', () => {
  const failWith = (name: string) =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('fail', name); });

  it('Mode B: QuotaExceededError shows a message, does not navigate, and retry succeeds', () => {
    const spy = failWith('QuotaExceededError');
    render(<ModeBPage />);
    fireEvent.click(screen.getByRole('button', { name: /이름 설계 시작|분석 시작/ }));
    expect(screen.getByText(/저장 공간이 부족해 입력을 저장하지 못했습니다/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    spy.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: /이름 설계 시작|분석 시작/ }));
    expect(push).toHaveBeenCalledWith('/mode-b/results');
    expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
  });

  it('Mode A: SecurityError blocks navigation with a settings message', () => {
    render(<ModeAPage />);
    // New inputs start with no permitted time; open a custom range explicitly.
    fireEvent.click(screen.getByRole('button', { name: /직접 지정/ }));
    fireEvent.change(screen.getByLabelText('허용 구간 1 시작'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('허용 구간 1 종료'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByLabelText(/담당 의료진이 허용한 범위임을 확인합니다/));
    failWith('SecurityError');
    fireEvent.click(screen.getByRole('button', { name: /출생 설계 분석 시작/ }));
    expect(screen.getByText(/브라우저 설정\(개인정보 보호 모드, 저장소 차단 등\)/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('Mode C: QuotaExceededError blocks navigation', () => {
    render(<ModeCPage />);
    fireEvent.change(screen.getByPlaceholderText(/이름 1/), { target: { value: '김민준' } });
    failWith('QuotaExceededError');
    fireEvent.click(screen.getByRole('button', { name: /이름 평가 시작/ }));
    expect(screen.getByText(/저장 공간이 부족해/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('Mode B/A input pages show generational-character errors and notices', () => {
    render(<ModeBPage />);
    const dolrim = screen.getByPlaceholderText('예) 민');
    fireEvent.change(dolrim, { target: { value: '빛' } });
    fireEvent.click(screen.getByRole('button', { name: /이름 설계 시작|분석 시작/ }));
    expect(screen.getByText(/순우리말이라 돌림자로 사용할 수 없습니다/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    fireEvent.change(dolrim, { target: { value: '힣' } });
    expect(screen.getByText(/한자 데이터가 없어 한자 없이\(미지정\)/)).toBeTruthy();
  });

  it('Mode B results: a Hanja choice that cannot be saved is flagged as not surviving reload', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(MIN_MIN));
    render(<ModeBResults />);
    const heading = await screen.findByRole('heading', { name: '김민서' });
    const card = heading.closest('div.bg-white') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /세부 분석 보기/ }));
    fireEvent.click(within(card).getByRole('button', { name: /한자 분석/ }));
    const seoCard = card.querySelectorAll<HTMLElement>('[data-hanja-status]')[2]; // 金, 敏, 瑞
    expect(seoCard.dataset.hanjaChar).toBe('瑞');
    fireEvent.click(seoCard);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('fail', 'QuotaExceededError'); });
    const alt = HANJA_DB['서'].find(o => o.hanja !== '瑞')!.hanja;
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.startsWith(alt))!);
    expect(await screen.findByText(/새로고침하면 사라질 수 있습니다/)).toBeTruthy();
    expect(heading.parentElement!.textContent).toContain(`敏${alt}`);
  });
});
