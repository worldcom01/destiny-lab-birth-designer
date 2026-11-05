'use client';

import { useEffect, useState } from 'react';
import { LoadState, loadAndRun } from './resultLoader';
import { Validation } from './inputValidation';

/**
 * Runs `loadAndRun` in a scheduled callback (so the loading screen renders first)
 * and always ends in 'ready' or 'error'. `validate` and `run` must be stable
 * (module-level) functions.
 */
export function useStoredAnalysis<I, R>(
  key: string,
  validate: (raw: unknown) => Validation<I>,
  run: (input: I) => R,
  delayMs = 60,
): LoadState<I, R> {
  const [state, setState] = useState<LoadState<I, R>>({ status: 'loading' });
  useEffect(() => {
    const timer = setTimeout(() => setState(loadAndRun(key, validate, run)), delayMs);
    return () => clearTimeout(timer);
  }, [key, validate, run, delayMs]);
  return state;
}
