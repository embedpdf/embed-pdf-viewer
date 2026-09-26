/** Whole-form hydration: every engine read of the field tree lands here. */
import type { FormCapability } from '../contract';
import type { FormContext, FormServices } from '../services';

export function createHydration(
  ctx: FormContext,
  { store, events, authority }: Pick<FormServices, 'store' | 'events' | 'authority'>,
) {
  const { model, apply, setStatus } = store;
  const { resynced } = events;
  const { can } = authority;

  const readSnapshot = async (): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    // No read authority → don't fire a doomed list (a reviewer-shaped token
    // without `doc.forms.read` is the COMMON narrowed scope); the model stays
    // empty and `canRead()` tells chrome why. The engine enforces regardless.
    if (!can('doc.forms.read')) {
      setStatus('forbidden');
      return;
    }
    if (!model().snapshot) setStatus('loading');
    try {
      const snapshot = await doc.forms.list();
      apply({ t: 'snapshot', snapshot });
      setStatus('ready');
      resynced.emit({ snapshot });
    } catch (err) {
      // A race with an access change 403s here; anything else is a real
      // load failure. Either way: surfaced, never an unhandled rejection.
      console.warn('[form] form snapshot failed to load', err);
      setStatus('error');
    }
  };
  // An invalidation that lands while a read is in flight queues one more
  // read after it — the snapshot can never settle stale (G5).
  let refreshRun: Promise<void> | null = null;
  let refreshAgain = false;
  const refresh = (): Promise<void> => {
    if (refreshRun) {
      refreshAgain = true;
      return refreshRun;
    }
    refreshRun = (async () => {
      do {
        refreshAgain = false;
        await readSnapshot();
      } while (refreshAgain);
    })().finally(() => {
      refreshRun = null;
    });
    return refreshRun;
  };

  return {
    refresh,
    api: { refresh, getStatus: () => ctx.getState().status } satisfies Partial<FormCapability>,
  };
}
export type FormHydration = ReturnType<typeof createHydration>;
