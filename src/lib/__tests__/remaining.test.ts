import { describe, expect, it } from 'vitest';
import { ModeBInput, NameStyle } from '@/types';
import { runModeBAnalysis } from '@/lib/analysis';
import { stylesFittingName } from '@/lib/scoring';
import { defaultBirthDate, loadModeBFormInit, loadModeCFormInit } from '@/lib/formRestore';
import { LEGACY_HANJA_SELECTION_KEYS, HANJA_SELECTION_KEYS, purgeLegacyHanjaSelections } from '@/lib/hanjaModel';

const store = (entries: Record<string, string>) => {
  const mem = new Map(Object.entries(entries));
  return {
    mem,
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => { mem.delete(k); },
  };
};

// ─── Style tags only claim styles the name actually fits ────────────────────

describe('style tags', () => {
  const STYLES: NameStyle[] = ['리더형']; // 42 of 200 names fit; before the fix all 200 were tagged
  const input: ModeBInput = {
    birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여',
    dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: STYLES,
  };
  const results = runModeBAnalysis(input);

  it('a "○○ 분류 글자 포함" tag or "○○ 스타일로 분류된 글자" sentence appears only when a character fits that style', () => {
    let tagged = 0;
    let untagged = 0;
    for (const r of results) {
      const fits = stylesFittingName(r.name, STYLES);
      for (const style of STYLES) {
        const claimed = r.characteristics.includes(`${style} 분류 글자 포함`) || r.description.includes(`'${style}' 스타일로 분류된 글자`);
        if (claimed) {
          expect(fits).toContain(style);
          expect([r.name.char1, r.name.char2].some(c => c.nameStyleFit?.includes(style))).toBe(true);
        }
      }
      if (fits.length > 0) tagged++; else untagged++;
      if (fits.length === 0) expect(r.characteristics.some(t => t.endsWith(' 분류 글자 포함'))).toBe(false);
      else expect(r.characteristics).toContain(`${fits[0]} 분류 글자 포함`); // the positive branch is really exercised
    }
    // The fixture exercises both branches.
    expect(tagged).toBeGreaterThan(0);
    expect(untagged).toBeGreaterThan(0);
  });

  it('scores are unchanged by the tag fix (all selected styles still count)', () => {
    const r = results[0];
    expect(r.scores.overall).toBe(runModeBAnalysis(input)[0].scores.overall);
  });
});

// ─── Default birth date follows Asia/Seoul ───────────────────────────────────

describe('default birth date', () => {
  it('uses the Seoul date even when UTC is still the previous day', () => {
    expect(defaultBirthDate(new Date('2026-11-08T16:30:00Z'))).toBe('2027-11-09'); // 01:30 KST on 11-09
    expect(defaultBirthDate(new Date('2028-02-28T15:00:00Z'))).toBe('2029-02-28'); // 02-29 KST clamps
  });
});

// ─── Mode B / Mode C input restore ───────────────────────────────────────────

describe('Mode B / Mode C input restore', () => {
  const now = new Date('2026-11-09T03:00:00Z');
  const B = {
    birthDate: '2027-07-04', birthHour: 13, surname: '이', gender: '여', dolrimChar: '민',
    dolrimPosition: 'first', dolrimHanja: '敏', images: ['학자형'], nameStyles: ['현대형'],
  };

  it('restores a valid Mode B input with a notice', () => {
    const init = loadModeBFormInit(now, store({ dlbd_mode_b: JSON.stringify(B) }));
    // R3-FIX F31: restored styles are announced (the notice starts with the generic sentence).
    expect(init).toMatchObject({ ...B });
    expect(init.restoreNotice!.startsWith('이전에 입력한 내용을 불러왔습니다.')).toBe(true);
    if (B.nameStyles.length) expect(init.restoreNotice).toContain(`이름 스타일(${B.nameStyles.join('·')})`);
  });

  it('starts fresh without a notice when nothing is stored', () => {
    const init = loadModeBFormInit(now, store({}));
    expect(init).toMatchObject({ birthDate: '2027-11-09', birthHour: 9, surname: '김', restoreNotice: null });
  });

  it('falls back to defaults with a notice for broken, tampered or unsupported input', () => {
    for (const text of ['{not json', JSON.stringify({ ...B, birthDate: '2035-01-01' }), JSON.stringify({ ...B, surname: '<script>' })]) {
      const init = loadModeBFormInit(now, store({ dlbd_mode_b: text }));
      expect(init.surname).toBe('김');
      expect(init.restoreNotice).toMatch(/새 입력으로 시작합니다/);
    }
    const throwing = { getItem: () => { throw new DOMException('blocked', 'SecurityError'); } };
    expect(loadModeBFormInit(now, throwing).restoreNotice).toMatch(/불러올 수 없어/);
  });

  it('restores Mode C names (keeping at least two rows) and rejects invalid input', () => {
    const c = { birthDate: '2027-03-15', birthHour: 21, gender: '남', names: ['김민준'] };
    const init = loadModeCFormInit(now, store({ dlbd_mode_c: JSON.stringify(c) }));
    expect(init).toMatchObject({ birthDate: '2027-03-15', birthHour: 21, gender: '남', names: ['김민준', ''] });
    expect(loadModeCFormInit(now, store({ dlbd_mode_c: JSON.stringify({ ...c, names: 'x' }) })).names).toEqual(['', '']);
  });
});

// ─── Legacy v1 Hanja selection keys ──────────────────────────────────────────

describe('legacy Hanja selection cleanup', () => {
  it('removes only the two v1 keys and never throws', () => {
    const s = store({
      [LEGACY_HANJA_SELECTION_KEYS.modeB]: '{"version":1,"names":{}}',
      [LEGACY_HANJA_SELECTION_KEYS.modeC]: '{"version":1,"names":{}}',
      [HANJA_SELECTION_KEYS.modeB]: '{"version":2,"scopes":{}}',
      dlbd_mode_b: '{}',
      unrelated: 'keep',
    });
    purgeLegacyHanjaSelections(s);
    expect([...s.mem.keys()].sort()).toEqual([HANJA_SELECTION_KEYS.modeB, 'dlbd_mode_b', 'unrelated'].sort());
    expect(() => purgeLegacyHanjaSelections({ removeItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
