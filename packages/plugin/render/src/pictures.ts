/**
 * Whether each page's picture is on screen: the reports the page layers keep, folded into one
 * state per page and view.
 *
 * A layer that paints a page opens a report on it when it mounts (`reportPicture`), and the page
 * is `loading` in that view from then on. It turns `ready` once a report says `shown()`, and
 * stays so: a later picture of the page replaces the one on screen only once it's there. A
 * failure before that makes it `forbidden` or `error`. `slow` turns on when it has been loading
 * for `slowAfterMs`, on the plugin's clock, and the page goes back to `idle` once every report on
 * it closed (its layers unmounted).
 *
 * Like the tile plans, the states live here and not in the plugin's state: they follow the
 * layers, which unmount while the document closes, after the plugin's state stopped taking
 * writes. A change wakes the readers with `ctx.notify()`, which does nothing by then.
 */
import {
  isPluginError,
  type Cancel,
  type PageObjectNumber,
  type PageRef,
  type PluginContext,
  type ResourceStatus,
} from '@embedpdf/core';
import type { PictureState, PictureStateChangedEvent, RenderSettings } from './contract';
import type { OpenPictureReport } from './host-contract';
import type { RenderState } from './model';

const pictureState = (status: ResourceStatus, slow = false): PictureState =>
  Object.freeze({ status, slow });

/** Every picture state there is, one object each, so the same state is the same object. */
export const PICTURE_STATES = {
  idle: pictureState('idle'),
  loading: pictureState('loading'),
  slow: pictureState('loading', true),
  ready: pictureState('ready'),
  forbidden: pictureState('forbidden'),
  error: pictureState('error'),
} as const;

/** What one report said: its picture showed, or why it can't. */
interface Report {
  shown: boolean;
  failure: 'forbidden' | 'error' | null;
}

/** A page some view shows, and the reports on it. */
interface ShownPage {
  readonly page: PageRef;
  readonly reports: Set<Report>;
  slow: boolean;
  /** The pending turn to `slow`, while it waits. */
  cancelSlow: Cancel | null;
  /** What it reads now. */
  state: PictureState;
}

/** A refusal for want of a permission, as a `PluginError` or its plain info. */
const isRefusal = (error: unknown): boolean =>
  isPluginError(error, 'permission-denied') ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'permission-denied');

/** One picture shown is enough; otherwise a failure, or still loading. */
function statusOf(shown: ShownPage): ResourceStatus {
  let failure: Report['failure'] = null;
  for (const report of shown.reports) {
    if (report.shown) return 'ready';
    if (report.failure === 'forbidden' || (report.failure && !failure)) failure = report.failure;
  }
  return failure ?? 'loading';
}

function stateOf(status: ResourceStatus, slow: boolean): PictureState {
  if (status === 'loading') return slow ? PICTURE_STATES.slow : PICTURE_STATES.loading;
  return PICTURE_STATES[status];
}

export function createPictureReports(
  ctx: PluginContext<RenderState, RenderSettings>,
  changed: (event: PictureStateChangedEvent) => void,
) {
  const views = new Map<string, Map<PageObjectNumber, ShownPage>>();
  // Layers unmount after the document closed: their last reports change nothing then.
  let closed = false;
  ctx.cleanup(() => {
    closed = true;
    for (const pages of views.values()) for (const shown of pages.values()) shown.cancelSlow?.();
    views.clear();
  });

  /** Fold a page's reports into its state, and tell the readers when that changed. */
  function publish(view: string, shown: ShownPage): void {
    const status = shown.reports.size === 0 ? 'idle' : statusOf(shown);
    if (status !== 'loading') {
      shown.cancelSlow?.();
      shown.cancelSlow = null;
      shown.slow = false;
    } else if (!shown.slow && !shown.cancelSlow) {
      const delay = ctx.settings().get().slowAfterMs;
      if (delay <= 0) {
        shown.slow = true;
      } else {
        shown.cancelSlow = ctx.clock.after(delay, () => {
          shown.cancelSlow = null;
          shown.slow = true;
          publish(view, shown);
        });
      }
    }
    const next = stateOf(status, shown.slow);
    if (shown.state === next) return;
    shown.state = next;
    ctx.notify();
    changed({ page: shown.page, view, ...next });
  }

  /** A page's state in a view: `idle` when the view doesn't show it. */
  function stateIn(view: string, pageObjectNumber: PageObjectNumber): PictureState {
    return views.get(view)?.get(pageObjectNumber)?.state ?? PICTURE_STATES.idle;
  }

  function open(view: string, page: PageRef): OpenPictureReport {
    const report: Report = { shown: false, failure: null };
    if (closed) return { shown() {}, failed() {}, close() {} };
    let pages = views.get(view);
    if (!pages) views.set(view, (pages = new Map()));
    let shown = pages.get(page.objectNumber);
    if (!shown) {
      shown = {
        page,
        reports: new Set(),
        slow: false,
        cancelSlow: null,
        state: PICTURE_STATES.idle,
      };
      pages.set(page.objectNumber, shown);
    }
    const target = shown;
    target.reports.add(report);
    publish(view, target);
    let open = true;
    return {
      shown() {
        if (!open || closed || report.shown) return;
        report.shown = true;
        report.failure = null;
        publish(view, target);
      },
      failed(error) {
        if (!open || closed || report.shown) return;
        report.failure = isRefusal(error) ? 'forbidden' : 'error';
        publish(view, target);
      },
      close() {
        if (!open || closed) return;
        open = false;
        target.reports.delete(report);
        if (target.reports.size === 0 && views.get(view)?.get(page.objectNumber) === target) {
          views.get(view)!.delete(page.objectNumber);
        }
        publish(view, target);
      },
    };
  }

  return { open, stateIn };
}
