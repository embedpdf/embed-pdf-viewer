import { describe, expect, it } from 'vitest';

import type { PdfFunctions, PdfRuntimeMemory } from '@embedpdf/engine-runtime';
import { ActionReadBudgetTracker, readActionModel } from '@embedpdf/engine-services';

/**
 * The Phase-4 skew law, pinned at the reader: a runtime payload that
 * predates the SubmitForm getters (engine-runtime pin lag) must yield the
 * PRE-payload node — bare `{ type: 'submit-form' }`, recognized-inert —
 * never a crash and never a degraded `unknown`. (The other half of the
 * atomic rule — a NEW runtime withholding an unresolvable payload degrades
 * the node — runs on the real runtime in both conformance flavors via the
 * `submit-not-url` / `submit-no-f` fixtures.)
 */
describe('action reader ↔ runtime skew', () => {
  it('an old runtime without submit getters yields the bare recognized-inert node', () => {
    // The minimal native surface the walker touches for ONE payload-less
    // node: no submit getters anywhere on the table — `typeof` probes miss.
    const SUBMIT_TYPE_CODE = 11;
    const fn = {
      EPDFAction_GetNodeCount: () => 1,
      EPDFAction_GetWarningFlags: () => 0,
      EPDFAction_IsComplete: () => true,
      EPDFAction_GetRootNode: () => 0,
      EPDFAction_GetNodeType: () => SUBMIT_TYPE_CODE,
      // Length-probe ABI: 0 = absent — the reader never allocates.
      EPDFAction_GetNodeSubtype: () => 0,
      EPDFAction_GetNextCount: () => 0,
      EPDFAction_CloseModel: () => undefined,
    } as unknown as PdfFunctions;
    // Never dereferenced on this path — every probed length is 0.
    const mem = {} as PdfRuntimeMemory;

    const tree = readActionModel(fn, mem, 1 as never, 1 as never, new ActionReadBudgetTracker());

    expect(tree).toEqual({
      root: { type: 'submit-form', subtype: '', next: [] },
      incomplete: false,
      warningFlags: 0,
      warnings: [],
    });
  });
});
