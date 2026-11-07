/**
 * The display: what the player's screen shows for the page on screen, and when.
 *
 * - The screen moves into the box of the page on screen. A new page hides the page layer until
 *   its frame is on screen, and the page's own background shows for that moment: no page ever
 *   shows in another's place.
 * - Once the view stays still, past where the page frame is sharp, the sharp layer shows a frame
 *   of just the part on screen. Any movement hides it at once, and the page layer under it never
 *   changed.
 * - A page whose content changed keeps showing until its new frame is on screen.
 * - A lent box's page is loading (its `report`) until its first frame is on screen.
 * - Graphics may drop a paused video when it changes size (a size the chip can't hold, a reset
 *   after sleep), and it stays black until it draws again: when the view rests at a new size, the
 *   page layer draws its frame again.
 */
import { encodePageKey, type Cancel, type PageRef, type PluginClock } from '@embedpdf/core';
import type { PicturePage, PictureReport } from '@embedpdf/plugin-render/contract';
import type { Rect } from '@embedpdf/plugin-stage/contract/host';

import type { ProtectedScreen } from '../contract';
import { pageFrameOf, pageKeyOfFrame, sharpFrameOf, shownSizeOf, type PageFrame } from './frames';
import { messageOf } from './routes';

/** How long the view stays still before the sharp frame is asked for. */
const REST_MS = 250;

/** A box a page layer lent the plugin, the page as the layer shows it now, and its report. */
export interface LentPage {
  readonly host: unknown;
  page: PicturePage;
  /** The page's loading state: `shown()` once a frame of it is on screen. */
  readonly report: PictureReport;
}

export interface DisplayOptions {
  readonly screen: ProtectedScreen;
  /** A frame of `page`, from the server: `query` says which. */
  fetchFrame(page: PageRef, query: Readonly<Record<string, string>>): Promise<ArrayBuffer>;
  readonly clock: PluginClock;
  /** The part of a page on screen, in page points, or `null` while it's off screen. */
  visibleRectOf(page: PageRef): Rect | null;
  /** A frame refused, a layer that couldn't show it. */
  onProblem(message: string): void;
  /** The document's lifetime: nothing is reported once it aborts. */
  readonly signal: AbortSignal;
}

export interface Display {
  /** The page on screen now, or `null`: the screen moves into its box and shows its frame. */
  show(page: LentPage | null): void;
  /** A lent box is going away. */
  forget(page: LentPage): void;
  /** The view moved: the sharp frame goes at once, and comes back once the view rests. */
  moving(): void;
  /** These pages' content changed: their frames are made again. */
  invalidate(pages: readonly PageRef[]): void;
  close(): void;
}

export function createDisplay(options: DisplayOptions): Display {
  const { screen, clock, signal, onProblem } = options;

  /** The lent page the screen is in. */
  let current: LentPage | null = null;
  /** The page frame on screen in the page layer. */
  let shown: PageFrame | null = null;
  /** The sharp frame on screen in the sharp layer. */
  let sharpKey: string | null = null;
  /** Each page's content version: an invalidation makes its frames again. */
  const versions = new Map<string, number>();
  // Counters that a newer page, or any movement, moves on: what was on its way is dropped.
  let turns = 0;
  let interaction = 0;
  let cancelRest: Cancel | null = null;
  /** The page's size on screen when the page layer last drew its frame. */
  let drawnSize = '';

  const versionOf = (pageKey: string) => versions.get(pageKey) ?? 0;
  const report = (error: unknown) => {
    if (!signal.aborted) onProblem(messageOf(error));
  };

  /** The frame `lent` shows: the one on screen while it's of the page's content, else a new one. */
  function pageFrameFor(lent: LentPage): PageFrame {
    const pageKey = encodePageKey(lent.page.ref);
    const version = versionOf(pageKey);
    if (shown !== null && shown.pageKey === pageKey && shown.version === version) return shown;
    return pageFrameOf(lent.page, version);
  }

  async function showPageFrame(lent: LentPage, keepShowing = false): Promise<void> {
    const mine = ++turns;
    const frame = pageFrameFor(lent);
    if (frame !== shown && !keepShowing) screen.page.hide();
    try {
      await screen.page.load(frame.key, () => options.fetchFrame(lent.page.ref, frame.query));
      if (mine !== turns) return;
      await screen.page.show(frame.key);
      if (mine !== turns) return;
      shown = frame;
      lent.report.shown();
      drawnSize = shownSizeOf(lent.page.transform);
      rest();
    } catch (error) {
      if (mine === turns && !signal.aborted) lent.report.failed(error);
      report(error);
    }
  }

  function hideSharp(): void {
    screen.sharp.hide();
    sharpKey = null;
  }

  function rest(): void {
    cancelRest?.();
    cancelRest = clock.after(REST_MS, () => {
      cancelRest = null;
      drawAgainIfResized();
      void showSharpFrame();
    });
  }

  /** The frame on screen, of the page on screen, or `null`. */
  function shownOnScreen(): { lent: LentPage; frame: PageFrame } | null {
    if (current === null || shown === null) return null;
    if (shown.pageKey !== encodePageKey(current.page.ref)) return null;
    return { lent: current, frame: shown };
  }

  function drawAgainIfResized(): void {
    const onScreen = shownOnScreen();
    if (onScreen === null) return;
    const size = shownSizeOf(onScreen.lent.page.transform);
    if (size === drawnSize) return;
    drawnSize = size;
    screen.page.redraw();
  }

  async function showSharpFrame(): Promise<void> {
    const onScreen = shownOnScreen();
    if (onScreen === null) return;
    const { lent, frame } = onScreen;
    const visible = options.visibleRectOf(lent.page.ref);
    if (visible === null) return;
    const sharp = sharpFrameOf(frame, lent.page.transform, visible);
    if (sharp === null || sharp.key === sharpKey) return;
    const mine = ++interaction;
    try {
      await screen.sharp.load(sharp.key, () => options.fetchFrame(lent.page.ref, sharp.query));
      if (mine !== interaction) return;
      // Hidden, so nobody sees the layer move.
      hideSharp();
      screen.sharp.place(sharp.rectInBox);
      await screen.sharp.show(sharp.key);
      if (mine !== interaction) return;
      sharpKey = sharp.key;
    } catch (error) {
      report(error);
    }
  }

  return {
    show(lent) {
      if (lent === current) return;
      current = lent;
      interaction++;
      cancelRest?.();
      hideSharp();
      if (lent === null) {
        turns++;
        screen.mount(null);
        return;
      }
      screen.mount(lent.host);
      void showPageFrame(lent);
    },

    forget(lent) {
      if (lent !== current) return;
      current = null;
      turns++;
      interaction++;
      cancelRest?.();
      hideSharp();
      screen.mount(null);
    },

    moving() {
      interaction++;
      hideSharp();
      rest();
    },

    invalidate(pages) {
      const stale = new Set(pages.map((page) => encodePageKey(page)));
      for (const pageKey of stale) versions.set(pageKey, versionOf(pageKey) + 1);
      const isStale = (key: string) => stale.has(pageKeyOfFrame(key));
      screen.page.forget(isStale);
      screen.sharp.forget(isStale);
      if (current !== null && stale.has(encodePageKey(current.page.ref))) {
        interaction++;
        hideSharp();
        // The old content stays until the new frame is on screen.
        void showPageFrame(current, true);
      }
    },

    close() {
      turns++;
      interaction++;
      cancelRest?.();
      screen.close();
    },
  };
}
