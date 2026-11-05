// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// Integration tests of the real Mode A input page in jsdom (not a real browser):
// native date/time picker popups and real mobile rendering are not exercised here.

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeAPage = (await import('@/app/mode-a/page')).default;

const startInput = () => screen.getByLabelText('시작일') as HTMLInputElement;
const endInput = () => screen.getByLabelText('종료일') as HTMLInputElement;
const preset = (name: RegExp) => screen.getByRole('button', { name });
const status = () => screen.getByTestId('time-status').textContent;
const summary = () => document.getElementById('mode-a-schedule-summary')!.textContent!;
const analyze = () => fireEvent.click(screen.getByRole('button', { name: /출생 설계 분석 시작/ }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T16:30:00Z')); // 2026-11-05 01:30 KST
  localStorage.clear();
  localStorage.setItem('unrelated_key', 'keep-me');
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Mode A dates', () => {
  it('starts two calendar months after today (Asia/Seoul) and sets the input value, not just the view', () => {
    render(<ModeAPage />);
    expect(startInput().value).toBe('2027-01-05'); // native pickers open on the value's month
    expect(endInput().value).toBe('2027-01-11');
    expect(startInput().min).toBe('2019-01-07');
    expect(startInput().max).toBe('2028-12-31');
    expect(endInput().min).toBe('2027-01-05');
  });

  it('keeps a manually chosen date', () => {
    render(<ModeAPage />);
    fireEvent.change(startInput(), { target: { value: '2027-02-10' } });
    fireEvent.change(endInput(), { target: { value: '2027-02-12' } });
    fireEvent.click(preset(/오전/));
    expect(startInput().value).toBe('2027-02-10');
    expect(summary()).toContain('2027-02-10 ~ 2027-02-12 (3일)');
  });

  it('explains when the computed default is beyond the supported data', () => {
    vi.setSystemTime(new Date('2028-11-15T03:00:00Z')); // → 2029-01-15
    render(<ModeAPage />);
    expect(startInput().value).toBe('');
    expect(screen.getByRole('alert').textContent).toContain('절기 데이터 확장이 필요합니다');
  });

  it('restores a valid saved date and schedule, but requires confirmation again', () => {
    localStorage.setItem('dlbd_mode_a', JSON.stringify({
      startDate: '2027-03-02', endDate: '2027-03-06', surname: '이', gender: '여', dolrimChar: '', dolrimPosition: 'auto',
      images: [], nameStyles: [], schedule: { providerConfirmed: true, timeRanges: [{ start: '13:00', end: '17:00' }], exactTimes: [] },
    }));
    render(<ModeAPage />);
    expect(startInput().value).toBe('2027-03-02');
    expect(preset(/오후/).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText(/담당 의료진이 허용한 범위임을 확인합니다/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/이전에 입력한 일정을 불러왔습니다/)).toBeTruthy();
  });

  it('does not restore a legacy schedule as a selection', () => {
    localStorage.setItem('dlbd_mode_a', JSON.stringify({
      startDate: '2027-03-02', endDate: '2027-03-06', surname: '이', gender: '여', dolrimChar: '', dolrimPosition: 'auto',
      images: [], nameStyles: [], analysisLevel: '정밀',
    }));
    render(<ModeAPage />);
    expect(startInput().value).toBe('2027-03-02');
    expect(status()).toBe('미선택');
    expect(screen.queryByLabelText('허용 구간 1 시작')).toBeNull();
  });
});

describe('Mode A permitted-time selection', () => {
  it('a new input has zero selected times and shows the required state', () => {
    render(<ModeAPage />);
    expect(status()).toBe('미선택');
    expect(screen.getAllByText('필수 입력').length).toBeGreaterThanOrEqual(2);
    for (const name of [/오전/, /오후/, /직접 지정/]) expect(preset(name).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText('허용 구간 1 시작')).toBeNull();
    expect(summary()).toContain('미선택');
    expect(screen.getByText(/필수 입력 미완료: 허용 시간, 의료진 확인/)).toBeTruthy();
  });

  it('explicit preset selection toggles and is summarised', () => {
    render(<ModeAPage />);
    fireEvent.click(preset(/오전 \(09:00–12:00\)/));
    expect(preset(/오전/).getAttribute('aria-pressed')).toBe('true');
    expect(status()).toBe('선택 완료');
    fireEvent.click(preset(/오후 \(13:00–17:00\)/));
    expect(summary()).toContain('09:00~12:00, 13:00~17:00 (매일, KST)');
    fireEvent.click(preset(/오전/)); // deselect
    expect(preset(/오전/).getAttribute('aria-pressed')).toBe('false');
    expect(summary()).toContain('13:00~17:00 (매일, KST)');
    expect(summary()).not.toContain('09:00~12:00');
  });

  it('manual ranges and exact times are supported, with an error state for invalid entries', () => {
    render(<ModeAPage />);
    fireEvent.click(preset(/직접 지정/));
    expect(preset(/직접 지정/).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('허용 구간 1 시작'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('허용 구간 1 종료'), { target: { value: '14:00' } });
    expect(status()).toBe('입력 오류');
    expect(summary()).toContain('종료 시각은 시작 시각보다 늦어야 합니다');
    fireEvent.change(screen.getByLabelText('허용 구간 1 종료'), { target: { value: '16:30' } });
    fireEvent.click(screen.getByRole('button', { name: /특정 시각 추가/ }));
    fireEvent.change(screen.getByLabelText('특정 시각 1'), { target: { value: '19:10' } });
    expect(status()).toBe('선택 완료');
    expect(summary()).toContain('15:00~16:30, 19:10 (특정 시각) (매일, KST)');
  });

  it('blocks submission until time and provider confirmation are both given; confirmation stays separate', () => {
    render(<ModeAPage />);
    analyze();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(preset(/오전/));
    expect((screen.getByLabelText(/담당 의료진이 허용한 범위임을 확인합니다/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/필수 입력 미완료: 의료진 확인/)).toBeTruthy();
    analyze();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem('dlbd_mode_a')).toBeNull();
    fireEvent.click(screen.getByLabelText(/담당 의료진이 허용한 범위임을 확인합니다/));
    expect(screen.getByText('필수 입력이 모두 완료되었습니다')).toBeTruthy();
    analyze();
    expect(push).toHaveBeenCalledWith('/mode-a/results');
    const stored = JSON.parse(localStorage.getItem('dlbd_mode_a')!);
    expect(stored.schedule).toEqual({ providerConfirmed: true, timeRanges: [{ start: '09:00', end: '12:00' }], exactTimes: [] });
    expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
  });

  it('never injects default times into stored input', () => {
    render(<ModeAPage />);
    fireEvent.click(preset(/직접 지정/));
    fireEvent.change(screen.getByLabelText('허용 구간 1 시작'), { target: { value: '10:20' } });
    fireEvent.change(screen.getByLabelText('허용 구간 1 종료'), { target: { value: '10:40' } });
    fireEvent.click(screen.getByLabelText(/담당 의료진이 허용한 범위임을 확인합니다/));
    analyze();
    expect(JSON.parse(localStorage.getItem('dlbd_mode_a')!).schedule.timeRanges).toEqual([{ start: '10:20', end: '10:40' }]);
  });
});

describe('Mode A mobile-friendly controls (markup only)', () => {
  it('uses 44px touch targets, 16px inputs and a single-column layout on narrow screens', () => {
    render(<ModeAPage />);
    for (const name of [/오전/, /오후/, /직접 지정/]) expect(preset(name).className).toContain('min-h-[44px]');
    expect(startInput().className).toContain('text-base'); // ≥16px avoids iOS focus zoom
    expect(startInput().className).toContain('min-h-[44px]');
    const group = screen.getByRole('group', { name: '허용 시간 선택' });
    expect(group.className).toContain('grid-cols-1');
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(startInput().closest('div.grid')!.className).toContain('grid-cols-1 sm:grid-cols-2');
  });
});
