// @vitest-environment jsdom
// R3-FIX F31: every style preference that is scored in Mode B is visible on the
// input page, can be selected and cleared, and equals what the engine receives.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModeBInput, NAME_STYLE_LABELS, NameStyle } from '@/types';
import { runModeBAnalysis } from '@/lib/analysis';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput } from '@/lib/inputValidation';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeBPage = (await import('@/app/mode-b/page')).default;
const ModeBResults = (await import('@/app/mode-b/results/page')).default;

const AUDIT = { birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [] };
const STYLES = Object.keys(NAME_STYLE_LABELS) as NameStyle[];

const styleButton = (s: NameStyle) => document.querySelector<HTMLButtonElement>(`[data-testid="mode-b-styles"] button[data-style="${s}"]`)!;
const pressed = () => STYLES.filter(s => styleButton(s).getAttribute('aria-pressed') === 'true');
const activeText = () => screen.getByTestId('mode-b-active-styles').textContent;
const submit = (): ModeBInput => {
  fireEvent.click(screen.getByRole('button', { name: /이름 설계 시작/ }));
  expect(push).toHaveBeenCalledWith('/mode-b/results');
  return JSON.parse(localStorage.getItem('dlbd_mode_b')!);
};
const store = (v: unknown) => localStorage.setItem('dlbd_mode_b', JSON.stringify(v));
const top = (input: ModeBInput) => { const r = runModeBAnalysis(input)[0]; return `${r.name.full} ${r.scores.overall}`; };

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(() => cleanup());

describe('Mode B style controls (F31)', () => {
  it('shows every style as a toggle; nothing selected by default', () => {
    render(<ModeBPage />);
    for (const s of STYLES) expect(styleButton(s)).toBeTruthy();
    expect(pressed()).toEqual([]);
    expect(activeText()).toBe('적용할 스타일: 없음');
    expect(screen.queryByTestId('mode-b-clear-styles')).toBeNull();
  });

  it('audit case: the two inputs are visibly different and score differently (김민서 80 vs 김민준 81)', () => {
    store({ ...AUDIT, nameStyles: [] });
    const plain = render(<ModeBPage />).container.innerHTML;
    const a = submit();
    expect(a.nameStyles).toEqual([]);
    expect(top(a)).toBe('김민서 80');
    cleanup(); push.mockClear();

    store({ ...AUDIT, nameStyles: ['전통형', '리더형'] });
    const styled = render(<ModeBPage />).container.innerHTML;
    expect(styled).not.toBe(plain);
    expect(pressed().sort()).toEqual(['리더형', '전통형']);
    expect(activeText()).toBe('적용할 스타일: 전통형 · 리더형');
    expect(screen.getByRole('status').textContent).toContain('이름 스타일(전통형·리더형)이 선택된 상태입니다');
    const b = submit();
    expect(b.nameStyles).toEqual(['전통형', '리더형']);
    expect(top(b)).toBe('김민준 81');
  });

  it('restored preferences can be deselected one by one or all at once, and the score follows', () => {
    store({ ...AUDIT, nameStyles: ['전통형', '리더형'] });
    render(<ModeBPage />);
    fireEvent.click(styleButton('리더형'));
    expect(pressed()).toEqual(['전통형']);
    expect(activeText()).toBe('적용할 스타일: 전통형');
    const one = submit();
    expect(one.nameStyles).toEqual(['전통형']);
    expect(runModeBAnalysis(one)).toEqual(runModeBAnalysis({ ...one, nameStyles: ['전통형'] }));
    cleanup(); push.mockClear();

    render(<ModeBPage />); // restores ['전통형']
    fireEvent.click(screen.getByTestId('mode-b-clear-styles'));
    expect(pressed()).toEqual([]);
    const none = submit();
    expect(none.nameStyles).toEqual([]);
    expect(top(none)).toBe('김민서 80');
  });

  it('selecting styles from scratch sends exactly the shown selection', () => {
    store({ ...AUDIT, nameStyles: [] });
    render(<ModeBPage />);
    expect(pressed()).toEqual([]);
    fireEvent.click(styleButton('전통형'));
    fireEvent.click(styleButton('리더형'));
    expect(activeText()).toBe('적용할 스타일: 전통형 · 리더형');
    expect(top(submit())).toBe('김민준 81');
  });

  it('duplicate stored styles are shown once, announced, and sent once', () => {
    store({ ...AUDIT, nameStyles: ['전통형', '전통형'] });
    render(<ModeBPage />);
    expect(pressed()).toEqual(['전통형']);
    expect(screen.getByRole('status').textContent).toContain('중복 저장된 이름 스타일은 하나로 정리했습니다');
    expect(submit().nameStyles).toEqual(['전통형']);
  });

  it('malformed stored styles are dropped explicitly while the rest of the input is kept', () => {
    store({ ...AUDIT, surname: '이', nameStyles: ['전통형', 'bogus'] });
    render(<ModeBPage />);
    expect(pressed()).toEqual(['전통형']);
    expect(screen.getByRole('status').textContent).toContain('올바르지 않은 값("bogus")은 제외했습니다');
    expect(submit()).toMatchObject({ surname: '이', nameStyles: ['전통형'] });
    cleanup(); push.mockClear();

    store({ ...AUDIT, surname: '박', nameStyles: '전통형' });
    render(<ModeBPage />);
    expect(pressed()).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('스타일 선택 없이 불러왔습니다');
    expect(submit()).toMatchObject({ surname: '박', nameStyles: [] });
  });

  it('legacy 자시 input: the time must be chosen again, the styles stay visible and removable', () => {
    store({ ...AUDIT, birthHour: 0, nameStyles: ['리더형'] }); // no sijinVersion → legacy
    render(<ModeBPage />);
    expect(screen.getByRole('status').textContent).toContain('출생 시간을 다시 선택해주세요');
    expect(screen.getByRole('status').textContent).toContain('이름 스타일(리더형)');
    expect(pressed()).toEqual(['리더형']);
    fireEvent.click(screen.getByRole('button', { name: /이름 설계 시작/ }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('출생 시간을 선택해주세요')).toBeTruthy();
  });

  it('the results page shows the preferences the analysis used', async () => {
    store({ ...AUDIT, nameStyles: ['전통형', '리더형'], images: ['예술형'], sijinVersion: 2 });
    render(<ModeBResults />);
    const line = await screen.findByTestId('applied-preferences', {}, { timeout: 15000 });
    expect(line.textContent).toContain('적용한 이름 스타일: 전통형·리더형 · 이미지: 예술형');
    cleanup();
    store({ ...AUDIT, nameStyles: [], sijinVersion: 2 });
    render(<ModeBResults />);
    expect((await screen.findByTestId('applied-preferences', {}, { timeout: 15000 })).textContent).toContain('적용한 이름 스타일: 없음 · 이미지: 없음');
  }, 60000);
  it('R36: legacy duplicate input → form → results recovers the confirmed Hanja with a notice', async () => {
    const legacy = { ...AUDIT, sijinVersion: 2, nameStyles: ['전통형', '전통형'] };
    const v = validateModeBInput(legacy); if (!v.ok) throw new Error('invalid');
    const oldScope = analysisScope({ ...v.value, nameStyles: ['전통형', '전통형'] }); // pre-R3-FIX scope
    // Raw pre-R3-FIX record: the save API refuses noncanonical (legacy) scopes since audit C1.
    localStorage.setItem(HANJA_SELECTION_KEYS.modeB, JSON.stringify({ version: 2, scopes: { [oldScope]: { updatedAt: 1, names: { 김민서: ['敏', null] } } } }));
    const before = localStorage.getItem(HANJA_SELECTION_KEYS.modeB);
    store(legacy);
    render(<ModeBPage />);
    expect(submit().nameStyles).toEqual(['전통형']);
    cleanup();
    render(<ModeBResults />);
    const notice = await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 });
    expect(notice.textContent).toContain('그때 확정한 한자 선택(1명)을 그대로 불러왔습니다');
    const card = [...document.querySelectorAll('h3')].find(h => h.textContent === '김민서')!.closest('.bg-white')!;
    expect(card.textContent).toContain('敏');
    expect(localStorage.getItem(HANJA_SELECTION_KEYS.modeB)).toBe(before); // nothing written or deleted
  }, 60000);

  it('R36: a normal input shows no recovery notice', async () => {
    store({ ...AUDIT, sijinVersion: 2, nameStyles: ['전통형'] });
    render(<ModeBResults />);
    await screen.findByTestId('applied-preferences', {}, { timeout: 15000 });
    expect(screen.queryByTestId('hanja-recovery-notice')).toBeNull();
  }, 60000);
});
