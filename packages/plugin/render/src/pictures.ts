/**
 * Whether each page's picture is on screen: the reports the page layers keep, folded into the
 * `pictures` state.
 *
 * A layer that paints a page opens a report on it when it mounts (`reportPicture`), and the page
 * is `loading` in that view from then on. It turns `ready` once a report says `shown()`, and
 * stays so: a later picture of the page replaces the one on screen only once it's there. A
 * failure before that makes it `forbidden` or `error`. `slow` turns on when it has been loading
 * for `slowAfterMs`, on the plugin's clock, and the page goes back to `idle` once every report on
 * it closed (its layers unmounted).
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
import { PICTURE_STATES, pictureStateOf, setPictureState, type RenderState } from './model';

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
    const pageObjectNumber = shown.page.objectNumber;
    if (pictureStateOf(ctx.state.get(), view, pageObjectNumber) === next) return;
    ctx.state.update(setPictureState, view, pageObjectNumber, next);
    changed({ page: shown.page, view, ...next });
  }

  function open(view: string, page: PageRef): OpenPictureReport {
    const report: Report = { shown: false, failure: null };
    if (closed) return { shown() {}, failed() {}, close() {} };
    let pages = views.get(view);
    if (!pages) views.set(view, (pages = new Map()));
    let shown = pages.get(page.objectNumber);
    if (!shown) {
      shown = { page, reports: new Set(), slow: false, cancelSlow: null };
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

  return { open };
}
