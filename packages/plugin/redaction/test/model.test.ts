import { describe, expect, it } from 'vitest';
import type { RedactionApplyResult } from '@embedpdf/engine-core';

import { finishApply, initialRedactionState, setLastResult, startApply } from '../src/model';

const result: RedactionApplyResult = {
  scope: { kind: 'pages', pages: [] },
  results: [],
  removedAnnotationCount: 0,
  meta: null,
};

describe('redaction transitions', () => {
  it('brackets an apply with the applying flag', () => {
    const idle = initialRedactionState();
    const running = startApply(idle);
    expect(running.applying).toBe(true);
    expect(startApply(running)).toBe(running);
    expect(finishApply(running).applying).toBe(false);
    expect(finishApply(idle)).toBe(idle);
  });

  it('records the last result and keeps the same state for the same result', () => {
    const recorded = setLastResult(initialRedactionState(), result);
    expect(recorded.lastResult).toBe(result);
    expect(setLastResult(recorded, result)).toBe(recorded);
  });
});
