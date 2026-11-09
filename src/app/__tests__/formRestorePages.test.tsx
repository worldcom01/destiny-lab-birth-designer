// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeBPage = (await import('@/app/mode-b/page')).default;
const ModeCPage = (await import('@/app/mode-c/page')).default;

const dateInput = () => document.querySelector<HTMLInputElement>('input[type=date]')!;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('unrelated_key', 'keep-me');
  push.mockClear();
});
afterEach(() => cleanup());

describe('Mode B / Mode C pages restore the previous input', () => {
  it('Mode B: restored fields are shown and submitted again unchanged', () => {
    const prev = {
      birthDate: '2027-07-04', birthHour: 13, surname: '이', gender: '여', dolrimChar: '민',
      dolrimPosition: 'first', dolrimHanja: '敏', images: [], nameStyles: ['현대형'],
    };
    localStorage.setItem('dlbd_mode_b', JSON.stringify(prev));
    render(<ModeBPage />);
    expect(screen.getByRole('status').textContent).toBe('이전에 입력한 내용을 불러왔습니다.');
    expect(dateInput().value).toBe('2027-07-04');
    expect((screen.getByPlaceholderText('예) 민') as HTMLInputElement).value).toBe('민');
    fireEvent.click(screen.getByRole('button', { name: /이름 설계 시작|분석 시작/ }));
    expect(push).toHaveBeenCalledWith('/mode-b/results');
    expect(JSON.parse(localStorage.getItem('dlbd_mode_b')!)).toEqual(prev);
    expect(localStorage.getItem('unrelated_key')).toBe('keep-me');
  });

  it('Mode C: restored names are shown; nothing stored means no notice', () => {
    render(<ModeCPage />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    localStorage.setItem('dlbd_mode_c', JSON.stringify({ birthDate: '2027-03-15', birthHour: 21, gender: '남', names: ['김민준', '이서연'] }));
    render(<ModeCPage />);
    expect(dateInput().value).toBe('2027-03-15');
    expect((screen.getByPlaceholderText(/이름 1/) as HTMLInputElement).value).toBe('김민준');
    expect((screen.getByPlaceholderText(/이름 2/) as HTMLInputElement).value).toBe('이서연');
  });
});
