import { describe, expect, it } from 'vitest';
import { registerFormEffects } from '../src/effects';

/**
 * G5 (known defect, fixed in form's migration step): a form event that lands
 * while `forms.list()` is already in flight must cause a second read; today
 * `if (refreshing) return` drops it and the snapshot stays stale. Marked
 * `fails` so the suite documents the defect and flips red when it is fixed.
 */
describe('form refresh loop (G5)', () => {
  it.fails('re-reads when an invalidation lands during an in-flight read', async () => {
    const reads: Array<(v: unknown) => void> = [];
    let listener: ((e: unknown) => void) | null = null;
    let state = { model: { fields: [] } };
    const ctx = {
      doc: {
        forms: { list: () => new Promise((r) => reads.push(r)) },
        events: { subscribe: (l: (e: unknown) => void) => ((listener = l), () => {}) },
      },
      getState: () => state,
      dispatch: (a: { model: unknown }) => {
        state = { model: a.model as never };
      },
      cleanup: () => {},
    } as unknown as Parameters<typeof registerFormEffects>[0];

    registerFormEffects(ctx);
    listener!({ type: 'stream.desynced', origin: { kind: 'local' } }); // read #1 starts
    listener!({ type: 'stream.desynced', origin: { kind: 'local' } }); // arrives during read #1
    expect(reads).toHaveLength(1);
    reads[0]({ fields: [], version: 1 });
    await new Promise((r) => setTimeout(r));
    expect(reads).toHaveLength(2); // a second read must follow
  });
});
