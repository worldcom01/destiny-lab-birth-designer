import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { DesignerInput, ModeBInput } from '@/types';
import { analyzeModeCNames, runModeAAnalysis, runModeBAnalysis } from '@/lib/analysis';
import {
  InputValidationError, classifyDolrim, dolrimNotice, validateDesignerInput, validateModeBInput, validateModeCInput,
} from '@/lib/inputValidation';
import { analysisScope, applySelectionToName, loadHanjaSelections, saveHanjaSelections, withSelection } from '@/lib/hanjaModel';
import { generateCandidateNames } from '@/lib/nameGenerator';
import { generateFullInterpretation } from '@/lib/interpretationEngine';
import { loadAndRun } from '@/lib/resultLoader';
import { writeStoredInput } from '@/lib/storage';

const BASE_B: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여',
  dolrimChar: '민', dolrimPosition: 'first', dolrimHanja: '敏', images: [], nameStyles: [],
};
const BASE_A: DesignerInput = {
  startDate: '2027-07-01', endDate: '2027-07-01', surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
  schedule: { providerConfirmed: true, timeRanges: [{ start: '09:00', end: '10:00' }], exactTimes: [] },
};
const memStorage = () => {
  const mem = new Map<string, string>();
  return { mem, getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
};
const issuesOf = (v: { ok: boolean; issues?: { message: string }[] }) => (v.ok ? '' : v.issues!.map(i => i.message).join(' | '));

// ─── B01 ─────────────────────────────────────────────────────────────────────

describe('B01 Hanja persistence is scoped to the analysis input', () => {
  it('reproduction: a stale 珉 selection does not override a newly confirmed 敏', () => {
    const s = memStorage();
    // The exact legacy (v1) payload from the audit, under the old key.
    s.setItem('dlbd_mode_b_hanja', JSON.stringify({ version: 1, names: { 김민서: ['珉', null] } }));
    const scope = analysisScope(validateModeBInput(BASE_B).ok ? BASE_B : {});
    const restored = loadHanjaSelections('dlbd_mode_b_hanja_v2', scope, s);
    expect(restored).toEqual({});
    const r = runModeBAnalysis(BASE_B).find(x => x.name.full === '김민서')!;
    expect(r.name.hanja.given[0]).toMatchObject({ hanja: '敏', status: 'confirmed' });
    // Even when applied directly, a v1 selection would have replaced it - which is why v1 is never applied.
    expect(applySelectionToName(r.name, ['珉', null]).hanja.given[0].hanja).toBe('珉');
  });

  it('keeps selections for the same input and isolates different inputs with the same full name', () => {
    const s = memStorage();
    const a = analysisScope(BASE_B);
    const sel = withSelection({}, '김민서', 1, '書');
    expect(saveHanjaSelections('k', a, sel, s)).toBe(true);
    expect(loadHanjaSelections('k', a, s)).toEqual(sel);
    for (const other of [
      { ...BASE_B, dolrimHanja: '珉' },            // Hanja change
      { ...BASE_B, dolrimPosition: 'second' as const }, // generational position
      { ...BASE_B, surname: '이' },                // different surname
      { ...BASE_B, birthDate: '2027-07-05' },
    ]) {
      expect(analysisScope(other)).not.toBe(a);
      expect(loadHanjaSelections('k', analysisScope(other), s)).toEqual({});
    }
  });

  it('scope identity ignores key order and preference order', () => {
    const { nameStyles, ...rest } = BASE_B;
    const reordered = { nameStyles, ...rest, images: ['학자형', '리더형'] } as ModeBInput; // different key order
    const original = { ...BASE_B, images: ['리더형', '학자형'] } as ModeBInput;
    expect(analysisScope(reordered)).toBe(analysisScope(original));
  });

  it('drops prototype-like keys from stored selections without polluting objects', () => {
    const s = memStorage();
    const scope = analysisScope(BASE_B);
    s.setItem('k', `{"version":2,"scopes":{"__proto__":{"names":{"김민서":["珉"]}},${JSON.stringify(scope)}:{"updatedAt":1,"names":{"__proto__":["珉"],"constructor":["珉"],"김민서":[null,"書"]}}}}`);
    expect(loadHanjaSelections('k', scope, s)).toEqual({ 김민서: [null, '書'] });
    expect(({} as Record<string, unknown>).names).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('reports a failed persistence instead of pretending it was saved', () => {
    const failing = { getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    expect(saveHanjaSelections('k', analysisScope(BASE_B), {}, failing)).toBe(false);
  });
});

// ─── H02 ─────────────────────────────────────────────────────────────────────

describe('H02 validators never throw on malformed preference values', () => {
  const BAD_VALUES: unknown[] = [
    [{ toString: null }], [null], [1], [[]], [{}], ['constructor'], ['__proto__'], ['toString'], ['hasOwnProperty'],
    'constructor', { length: 1, 0: '리더형' }, 42, null,
  ];

  it.each(BAD_VALUES.map(v => [JSON.stringify(v) ?? String(v), v]))('rejects %s in images and nameStyles for Mode A and B', (_, value) => {
    for (const field of ['images', 'nameStyles']) {
      const b = { ...BASE_B, [field]: value };
      expect(() => validateModeBInput(b)).not.toThrow();
      expect(validateModeBInput(b).ok).toBe(false);
      const a = { ...BASE_A, [field]: value };
      expect(() => validateDesignerInput(a)).not.toThrow();
      expect(validateDesignerInput(a).ok).toBe(false);
    }
  });

  it('legitimate legacy input without preference fields still validates', () => {
    const legacy = { ...BASE_B } as Record<string, unknown>;
    delete legacy.images;
    delete legacy.nameStyles;
    delete legacy.dolrimHanja;
    expect(validateModeBInput(legacy).ok).toBe(true);
  });

  it('a stored "__proto__" key does not affect validation or pollute prototypes', () => {
    const raw = JSON.parse(`{"__proto__":{"polluted":true},${JSON.stringify(BASE_B).slice(1)}`);
    expect(validateModeBInput(raw).ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a throwing validator still ends in an error state (recovery boundary)', () => {
    const storage = { getItem: () => JSON.stringify(BASE_B) };
    const state = loadAndRun('k', () => { throw new TypeError('Cannot convert object to primitive value'); }, () => 1, storage);
    expect(state).toMatchObject({ status: 'error', error: { kind: 'analysis' } });
    const tampered = loadAndRun('k', validateModeBInput, runModeBAnalysis,
      { getItem: () => JSON.stringify({ ...BASE_B, nameStyles: [{ toString: null }] }) });
    expect(tampered).toMatchObject({ status: 'error', error: { kind: 'invalid' } });
  });

  it('Mode C rejects malformed name entries without throwing', () => {
    for (const names of [[{ toString: null }], [null], 'x', [['김민준']]]) {
      const v = { birthDate: '2027-07-04', birthHour: 9, gender: '남', names };
      expect(() => validateModeCInput(v)).not.toThrow();
      expect(validateModeCInput(v).ok).toBe(false);
    }
  });
});

// ─── H03 ─────────────────────────────────────────────────────────────────────

describe('H03 generational character validation', () => {
  it('classifies characters (malformed vs native word vs unsupported data vs supported)', () => {
    expect(classifyDolrim('A')).toEqual({ kind: 'malformed' });
    expect(classifyDolrim('ㅁ')).toEqual({ kind: 'malformed' });
    expect(classifyDolrim(7)).toEqual({ kind: 'malformed' });
    expect(classifyDolrim('빛')).toEqual({ kind: 'native-word' });
    expect(classifyDolrim('힣')).toEqual({ kind: 'supported', hasHanjaData: false });
    expect(classifyDolrim('민')).toEqual({ kind: 'supported', hasHanjaData: true });
    expect(classifyDolrim('')).toEqual({ kind: 'none' });
  });

  it.each([
    ['A', undefined, '한글 한 글자'],
    ['빛', undefined, '순우리말'],
    ['민', '俊', "'俊'은(는) '민' 음으로 등록된 한자가 아닙니다"],
    ['', '敏', '돌림자 없이'],
    ['힣', '敏', '등록된 한자가 아닙니다'],
  ])('rejects dolrim %s with hanja %s in UI and engine', (dolrimChar, dolrimHanja, expected) => {
    const input = { ...BASE_B, dolrimChar, dolrimHanja };
    const v = validateModeBInput(input);
    expect(v.ok).toBe(false);
    expect(issuesOf(v)).toContain(expected);
    expect(() => runModeBAnalysis(input)).toThrow(InputValidationError);
    expect(validateDesignerInput({ ...BASE_A, dolrimChar, dolrimHanja }).ok).toBe(false);
  });

  it('accepts valid 민 with 敏 and keeps it confirmed', () => {
    expect(validateModeBInput(BASE_B).ok).toBe(true);
    const r = runModeBAnalysis(BASE_B);
    expect(r.every(x => x.name.hanja.given[0].hanja === '敏' && x.name.hanja.given[0].status === 'confirmed')).toBe(true);
    expect(runModeAAnalysis({ ...BASE_A, dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'first' })
      .every(x => x.name.hanja.given[0].hanja === '敏')).toBe(true);
  });

  it('accepts a legitimate Hangul syllable without data and reports it explicitly', () => {
    const input = { ...BASE_B, dolrimChar: '힣', dolrimHanja: undefined };
    expect(validateModeBInput(input).ok).toBe(true);
    expect(dolrimNotice('힣')).toContain('한자 데이터가 없어');
    expect(dolrimNotice('민')).toBeNull();
    expect(runModeBAnalysis(input).every(x => x.name.given.includes('힣') && x.name.hanja.given.some(c => c.hangul === '힣' && c.status === 'unassigned'))).toBe(true);
  });

  it('the generator itself refuses instead of silently dropping constraints', () => {
    const d = { ...BASE_A, schedule: undefined };
    expect(() => generateCandidateNames({ ...d, dolrimChar: '빛' })).toThrow(RangeError);
    expect(() => generateCandidateNames({ ...d, dolrimChar: 'A' })).toThrow(RangeError);
    expect(() => generateCandidateNames({ ...d, dolrimChar: '민', dolrimHanja: '俊' })).toThrow(RangeError);
  });
});

// ─── H04 ─────────────────────────────────────────────────────────────────────

describe('H04 storage write failures', () => {
  const throwing = (name: string) => ({ setItem: () => { throw new DOMException('x', name); } });

  it('QuotaExceededError, SecurityError and unknown failures are reported in Korean', () => {
    expect(writeStoredInput('k', {}, throwing('QuotaExceededError'))).toMatchObject({ ok: false, message: expect.stringContaining('저장 공간이 부족') });
    expect(writeStoredInput('k', {}, throwing('SecurityError'))).toMatchObject({ ok: false, message: expect.stringContaining('브라우저 설정') });
    expect(writeStoredInput('k', {}, throwing('UnknownError'))).toMatchObject({ ok: false, message: expect.stringContaining('저장하지 못했습니다') });
    const s = memStorage();
    expect(writeStoredInput('k', { a: 1 }, s)).toEqual({ ok: true });
    expect(s.mem.get('k')).toBe('{"a":1}');
  });
});

// ─── H05 ─────────────────────────────────────────────────────────────────────

describe('H05 result copy makes no developmental, health or success predictions', () => {
  const FORBIDDEN = /발달 가능성|성취로|성공|탁월|잠재력|예상할 수|될 것입니다|할 것입니다|이어질 것|보장합니다|능력이 뛰어|능력이 있습니다|성과를|적성/;

  it('descriptions, tags and interpretations across all dominant elements are free of predictive claims', () => {
    const seen = new Set<string>();
    for (let offset = 0; offset < 365 && seen.size < 5; offset += 11) {
      for (const birthHour of [1, 7, 13, 19]) {
        const birthDate = new Date(Date.UTC(2027, 0, 1 + offset)).toISOString().slice(0, 10);
        const input = { ...BASE_B, birthDate, birthHour, dolrimChar: '', dolrimHanja: undefined, images: ['리더형' as const] };
        if (!validateModeBInput(input).ok) continue;
        const [r] = runModeBAnalysis(input);
        const dom = Object.entries(r.sajuOhaengBalance).sort((a, b) => b[1] - a[1])[0][0];
        seen.add(dom);
        const interp = generateFullInterpretation(r);
        const texts = [r.description, ...r.characteristics, ...Object.values(interp)];
        for (const t of texts) expect(t).not.toMatch(FORBIDDEN);
        expect(interp.summary).toContain('예측하지 않습니다');
      }
    }
    expect(seen.size).toBe(5);
  });

  it('uses the traditional-interpretation wording for balanced distributions', () => {
    const { results } = analyzeModeCNames({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: ['김민준'] });
    expect(results[0].description).toMatch(/^전통적 오행 해석에서는/);
  });
});

// ─── ESLint remediation ─────────────────────────────────────────────────────

describe('ESLint', () => {
  it('HanjaPicker has no lint errors', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [report] = await eslint.lintFiles(['src/components/HanjaPicker.tsx']);
    expect(report.errorCount).toBe(0);
  }, 60_000);
});
