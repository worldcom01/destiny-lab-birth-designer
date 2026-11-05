// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { DesignerInput, ModeBInput } from '@/types';
import { useStoredAnalysis } from '@/lib/useStoredAnalysis';
import { validateModeBInput } from '@/lib/inputValidation';

// Integration tests of the real page components in jsdom (not a real browser).

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));

const ModeAResults = (await import('@/app/mode-a/results/page')).default;
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;
const ModeAPage = (await import('@/app/mode-a/page')).default;

const modeA: DesignerInput = {
  startDate: '2027-07-02', endDate: '2027-07-02', surname: '김', gender: '여',
  dolrimChar: '민', dolrimPosition: 'first', images: [], nameStyles: [],
  schedule: { providerConfirmed: true, timeRanges: [{ start: '09:30', end: '10:15' }], exactTimes: [] },
};
const modeB: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('unrelated_key', 'keep-me');
  push.mockClear();
});
afterEach(cleanup);

async function expectRecovery(title: RegExp, backTo: string, key: string, stored: string | null) {
  await screen.findByRole('alert');
  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.queryByText(/분석 중\.\.\./)).toBeNull(); // loading ended
  fireEvent.click(screen.getByRole('button', { name: /입력 화면으로 돌아가기/ }));
  expect(push).toHaveBeenCalledWith(backTo);
  expect(localStorage.getItem(key)).toBe(stored); // stored input preserved
  expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
}

describe('Mode A result page recovery', () => {
  it('invalid JSON → recovery message and return to /mode-a', async () => {
    localStorage.setItem('dlbd_mode_a', '{broken');
    render(<ModeAResults />);
    expect(screen.getByText(/출생 설계 분석 중/)).toBeTruthy(); // loading first
    await expectRecovery(/손상되어 읽을 수 없습니다/, '/mode-a', 'dlbd_mode_a', '{broken');
  });

  it('legacy input without a medical schedule is not analysed', async () => {
    const legacy = JSON.stringify({ ...modeA, schedule: undefined, analysisLevel: '정밀' });
    localStorage.setItem('dlbd_mode_a', legacy);
    render(<ModeAResults />);
    await expectRecovery(/그대로 분석할 수 없습니다/, '/mode-a', 'dlbd_mode_a', legacy);
    expect(screen.getByText(/의료진이 허용한 시간대 정보가 없습니다/)).toBeTruthy();
  });

  it('tampered 31-day range is rejected with the reason', async () => {
    const tampered = JSON.stringify({ ...modeA, startDate: '2027-07-01', endDate: '2027-07-31' });
    localStorage.setItem('dlbd_mode_a', tampered);
    render(<ModeAResults />);
    await expectRecovery(/유효하지 않아 분석하지 않았습니다/, '/mode-a', 'dlbd_mode_a', tampered);
    expect(screen.getByText(/최대 30일/)).toBeTruthy();
  });

  it('missing input → recovery message', async () => {
    render(<ModeAResults />);
    await expectRecovery(/저장된 입력이 없습니다/, '/mode-a', 'dlbd_mode_a', null);
  });

  it('valid input renders results that show the permitted slot, not a whole branch', async () => {
    localStorage.setItem('dlbd_mode_a', JSON.stringify(modeA));
    render(<ModeAResults />);
    await screen.findByText(/MODE A 결과/);
    expect(screen.getAllByText(/09:30~10:15 \(KST\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/사시\(9~11시\)/)).toBeNull();
  });
});

describe('Mode B result page recovery', () => {
  it('missing input → return to /mode-b', async () => {
    render(<ModeBResults />);
    await expectRecovery(/저장된 입력이 없습니다/, '/mode-b', 'dlbd_mode_b', null);
  });

  it('a 시진 containing a solar-term transition is refused, not approximated', async () => {
    const stored = JSON.stringify({ ...modeB, birthDate: '2024-02-04', birthHour: 17 });
    localStorage.setItem('dlbd_mode_b', stored);
    render(<ModeBResults />);
    await expectRecovery(/유효하지 않아/, '/mode-b', 'dlbd_mode_b', stored);
    expect(screen.getByText(/입춘 17:27 KST/)).toBeTruthy();
  });

  it('valid input renders', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(modeB));
    render(<ModeBResults />);
    await screen.findByText(/MODE B 결과/);
  });
});

describe('Mode C result page recovery', () => {
  it('tampered names → return to /mode-c', async () => {
    const stored = JSON.stringify({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: 42 });
    localStorage.setItem('dlbd_mode_c', stored);
    render(<ModeCResults />);
    await expectRecovery(/유효하지 않아/, '/mode-c', 'dlbd_mode_c', stored);
  });

  it('valid legacy input with an ambiguous name still renders and reports the skipped name', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: ['김민준', '남궁민'] }));
    render(<ModeCResults />);
    await screen.findByText(/MODE C 결과/);
    expect(screen.getByText(/‘남궁민’ 은\(는\) 분석하지 않았습니다/)).toBeTruthy();
  });
});

describe('useStoredAnalysis', () => {
  it('always leaves the loading state when the scheduled analysis throws', async () => {
    localStorage.setItem('k', JSON.stringify(modeB));
    const explode = () => { throw new Error('unexpected'); };
    const { result } = renderHook(() => useStoredAnalysis('k', validateModeBInput, explode, 10));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ error: { kind: 'analysis' } });
  });
});

describe('Mode A input page medical constraints', () => {
  it('does not start without a provider-confirmed time window, then stores a validated schedule', () => {
    render(<ModeAPage />);
    fireEvent.click(screen.getByRole('button', { name: /출생 설계 분석 시작/ }));
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem('dlbd_mode_a')).toBeNull();
    expect(screen.getByText(/1개 이상 입력해주세요/)).toBeTruthy();
    expect(screen.getByText(/의료진이 허용한 범위인지 확인해주세요/)).toBeTruthy();

    // New inputs start with no permitted time; open a custom range explicitly.
    fireEvent.click(screen.getByRole('button', { name: /직접 지정/ }));
    fireEvent.change(screen.getByLabelText('허용 구간 1 시작'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('허용 구간 1 종료'), { target: { value: '10:15' } });
    fireEvent.click(screen.getByLabelText(/담당 의료진이 허용한 범위임을 확인합니다/));
    fireEvent.click(screen.getByRole('button', { name: /출생 설계 분석 시작/ }));

    expect(push).toHaveBeenCalledWith('/mode-a/results');
    const stored = JSON.parse(localStorage.getItem('dlbd_mode_a')!);
    expect(stored.schedule).toEqual({ providerConfirmed: true, timeRanges: [{ start: '09:30', end: '10:15' }], exactTimes: [] });
    expect(stored.analysisLevel).toBeUndefined();
  });
});
