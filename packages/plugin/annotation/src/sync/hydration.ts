import type { DocumentEvent, ResourceStatus } from '@embedpdf/core';
import type { Annot } from '@embedpdf/core-annotation';
import { toPageRef, type PageRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationHydration } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { RemoteSync } from './remote';

type Snapshot = Awaited<
  ReturnType<NonNullable<AnnotationContext['doc']>['annotations']['listRawAll']>
>;

/**
 * Whole-document hydration. The plugin ALWAYS hydrates every page via
 * `listRawAll()` — one bulk request on cloud, one raw worker job locally. A
 * comments sidebar needs every page, and per-page lazy loading could never
 * truthfully claim completeness. Coherence protocol: the snapshot arrives
 * cursor-stamped (`auditHead`); remote annotation events arriving DURING the
 * hydration window queue here and replay by cursor after ingest — events
 * with `serverId <= auditHead` are already inside the snapshot and drop,
 * newer ones apply on top. This makes the delete-during-hydrate
 * resurrection structurally impossible. `stream.desynced` re-runs the same
 * ingest with `bumpAp` (rasters may have changed invisibly inside the gap).
 */
export function createHydration(
  ctx: Pick<AnnotationContext, 'doc' | 'dispatch' | 'getState'>,
  {
    store,
    geometry,
    records,
    authority,
    events,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'records' | 'authority' | 'events'>,
  remote: RemoteSync,
) {
  let started = false;
  let window = false;
  let running: Promise<void> | null = null;
  let again = false;
  const pendingRemote: DocumentEvent[] = [];

  const setHydration = (hydration: AnnotationHydration): void =>
    ctx.dispatch({ type: 'SET_HYDRATION', hydration });

  const ingestSnapshot = (snap: Snapshot, bumpAp: boolean): void => {
    const annots: Annot[] = [];
    for (const page of snap.pages) {
      const crop = geometry.cropOf(page.pageState.page.pageObjectNumber);
      if (!crop) continue;
      // Children (replies, states, attached links) enter the substrate as
      // first-class annots; the planes derive (paint cull + lenses).
      annots.push(...page.annotations.map((d) => records.ingest(d, crop)));
    }
    store.commit({ t: 'hydrated', annots, bumpAp });
  };

  const runHydration = (bumpAp: boolean): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return Promise.resolve();
    // No read grant → no doomed listRawAll: the state says so, the comments
    // panel hides, and a later rehydrate (e.g. post-/access) re-checks.
    if (!authority.canRead()) {
      setHydration({ status: 'forbidden' });
      return Promise.resolve();
    }
    window = true;
    setHydration({ status: 'loading' });
    const run = doc.annotations
      .listRawAll()
      .then((snap) => {
        ingestSnapshot(snap, bumpAp);
        const head = snap.auditHead;
        const queued = pendingRemote.splice(0);
        window = false;
        for (const event of queued) {
          const serverId = 'origin' in event ? event.origin.serverId : null;
          // ≤ auditHead ⇒ already inside the snapshot; drop. Absent head =
          // a local engine, which has no remote events anyway.
          if (head !== undefined && serverId !== null && serverId <= head) continue;
          remote.apply(event);
        }
        setHydration({ status: 'complete' });
        events.resynced.emit({ pages: 'all' });
      })
      .catch((error: unknown) => {
        // Degrade to live-only: queued and future events apply directly so
        // the view stays as correct as it can be until a rehydrate lands.
        window = false;
        for (const event of pendingRemote.splice(0)) remote.apply(event);
        setHydration({ status: 'error', error });
      })
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          running = runHydration(true);
        }
      });
    running = run;
    return run;
  };

  const rehydrate = (): Promise<void> => {
    if (running) {
      // A desync during an in-flight hydration: that snapshot may already
      // be stale — run once more after it settles.
      again = true;
      return running;
    }
    running = runHydration(true);
    return running;
  };

  /** Replace one page's annotations from the engine (cross-plane deletes
   *  actually disappear; an inserted page's annotations arrive). */
  const reloadPage = async (pon: number): Promise<void> => {
    const doc = ctx.doc;
    const crop = geometry.cropOf(pon);
    if (!doc || !crop) return;
    try {
      const snap = await doc.page(toPageRef(pon)).annotations.list();
      // Replace, not merge: drop this page's current annots first so
      // cross-plane deletions (deleteField) actually disappear.
      const m = store.model();
      const stale = m.order.filter((id) => m.byId[id]?.page.pageObjectNumber === pon);
      if (stale.length) store.commit({ t: 'remove', ids: stale });
      store.commit({ t: 'loaded', annots: snap.annotations.map((d) => records.ingest(d, crop)) });
      events.resynced.emit({ pages: [toPageRef(pon)] });
    } catch {
      // A failed reload leaves the previous view; the next event or a
      // rehydrate reconciles.
    }
  };

  const api = {
    getStatus: (): ResourceStatus => {
      const h = ctx.getState().hydration;
      return h.status === 'complete' ? 'ready' : h.status;
    },
    refresh: () => rehydrate(),
    onResynced: events.resynced.on,
    getHydration: () => ctx.getState().hydration,
    ensureHydrated: () => {
      if (started) return;
      started = true;
      void runHydration(false);
    },
    // Whole-document hydration supersedes per-page loading: the model is
    // seeded by `listRawAll()` at document open (see `ensureHydrated`), so
    // a page mount has nothing to fetch. Kept as API for layers/plugins
    // that call it on mount; appearance fetching stays per-page/viewport.
    reloadPage: (page: PageRef) => reloadPage(page.pageObjectNumber),
    deliverRemoteEvent: (event: DocumentEvent) => {
      if (window) {
        pendingRemote.push(event);
        return;
      }
      remote.apply(event);
    },
  };

  return { rehydrate, reloadPage, api };
}

export type Hydration = ReturnType<typeof createHydration>;
