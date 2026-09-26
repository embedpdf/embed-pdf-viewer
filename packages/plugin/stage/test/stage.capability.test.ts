import { describe, expect, it } from 'vitest';
import { createCapabilityToken, toPageRef } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { createStageController } from '../src/controller';
import { initialStageState } from '../src/model';
import { DEFAULT_SETTINGS, settingsEqual } from '../src/settings';
import { stagePlugin } from '../src/stage.plugin';
import type { StageCapability, StageConfig, StageHostCapability } from '../src/host-contract';

/** The registry fields a test mutates to simulate a page mutation. */
interface MutableRegistry {
  revision: number;
  pages: Array<{ index: number; ref: ReturnType<typeof toPageRef>; rotation: number }>;
}

/**
 * Drive the real controller against the real transitions and the real
 * stage-core, with a test document and an injectable scheduler. No DOM and
 * no async: the stage is deterministically testable because the core is pure.
 */
function harness(
  sizes: Array<{ width: number; height: number; rotation?: 0 | 90 | 180 | 270 }>,
  config: StageConfig = {},
  options: { skipViewport?: boolean } = {},
) {
  const ctx = createTestContext({
    id: 'stage',
    // Lay out at 1:1 (world units = points) so absolute-size assertions read
    // cleanly; the 96/72 physical factor is covered by the stage-core layout test.
    state: initialStageState({ viewUnitsPerPoint: 1, ...config }),
    pages: sizes.map((size, index) => ({
      ref: toPageRef(index + 1),
      size: { width: size.width, height: size.height },
      rotation: size.rotation ?? 0,
    })),
  });
  // The live registry the controller reads through `document()`. Changing a
  // page's rotation and bumping `revision` simulates a rotate, move or delete
  // event, as the kernel's registry update would.
  const meta = ctx.document() as unknown as MutableRegistry;
  // Typed as the declared host lens: the composed slices' inferred signatures
  // make optional parameters (`options`) look required.
  const stage: StageHostCapability = ctx.connect(createStageController(ctx, config));
  const transitions: Array<{
    placed: boolean;
    pages: ReturnType<StageCapability['listVisiblePages']>;
    pageScreenX: number | null;
    metrics: ReturnType<StageHostCapability['getScrollMetrics']>;
  }> = [];
  ctx.state.onChange(({ previous, next }) => {
    transitions.push({
      placed: !previous.placed && next.placed,
      pages: stage.listVisiblePages(),
      pageScreenX: stage.getPageFrame(toPageRef(1))?.screenX ?? null,
      metrics: stage.getScrollMetrics(),
    });
  });
  // As in the real lifecycle, the host reports the viewport, and initial
  // placement is level-triggered inside setViewportSize.
  if (!options.skipViewport) stage.setViewportSize({ width: 1000, height: 700 });
  return { ctx, stage, meta, transitions };
}

const PORTRAIT = Array.from({ length: 5 }, () => ({ width: 600, height: 800 }));
const PAD = 24; // default StageSettings.padding — the fit inset + arrival gutter

describe('initial placement is level-triggered', () => {
  it('publishes screen geometry only on the final placement commit', () => {
    const { stage, transitions } = harness(PORTRAIT, undefined, { skipViewport: true });
    const pendingPages = stage.listVisiblePages();

    expect(pendingPages).toEqual([]);
    expect(stage.listVisiblePages()).toBe(pendingPages); // stable empty selector value
    expect(stage.getPageFrame(toPageRef(1))).toBeNull();
    expect(stage.getScrollMetrics()).toEqual({
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      clientWidth: 0,
      clientHeight: 0,
      scrollableX: false,
      scrollableY: false,
    });

    stage.setViewportSize({ width: 1000, height: 700 });

    const commit = transitions.findIndex((transition) => transition.placed);
    expect(commit).toBeGreaterThan(0);
    for (const transition of transitions.slice(0, commit)) {
      expect(transition.pages).toBe(pendingPages);
      expect(transition.pageScreenX).toBeNull();
      expect(transition.metrics.scrollableX).toBe(false);
      expect(transition.metrics.scrollableY).toBe(false);
    }
    expect(transitions[commit].pages.map((page) => page.pageIndex)).toContain(0);
    expect(transitions[commit].pageScreenX).toBeCloseTo(200, 0);
  });

  it('places the moment the viewport is reported, with no watcher involved', () => {
    // An edge-triggered watcher would miss a viewport that was sized before it
    // subscribed, leaving the camera at {0,0,1} (page flush top-left, no
    // padding) until a scroll.
    const { stage } = harness(PORTRAIT); // the harness never calls placeInitial
    expect(stage.getCamera()).not.toEqual({ x: 0, y: 0, zoom: 1 }); // not the untouched camera
    // page 1 is properly placed: horizontally centered, top a padding down
    const box = stage.getPageFrame(toPageRef(1))!;
    const center = stage.worldToViewport({ x: box.x + box.width / 2, y: box.y });
    expect(center.x).toBeCloseTo(500, 0);
    expect(center.y).toBeCloseTo(PAD, 0);
  });

  it('a half-laid-out viewport (height 0) does not place; the real one does', () => {
    const { stage, transitions } = harness(PORTRAIT, undefined, { skipViewport: true });
    const pendingPages = stage.listVisiblePages();
    stage.setViewportSize({ width: 1000, height: 0 }); // mid-layout flex collapse
    expect(stage.getCamera()).toEqual({ x: 0, y: 0, zoom: 1 }); // not placed yet
    expect(stage.listVisiblePages()).toBe(pendingPages);
    expect(stage.getPageFrame(toPageRef(1))).toBeNull();
    expect(transitions.some((transition) => transition.placed)).toBe(false);
    stage.setViewportSize({ width: 1000, height: 700 }); // the real report
    expect(stage.getCamera()).not.toEqual({ x: 0, y: 0, zoom: 1 }); // placed now
    expect(stage.listVisiblePages()).not.toBe(pendingPages);
    expect(
      stage.worldToViewport({
        x: stage.getPageFrame(toPageRef(1))!.x,
        y: stage.getPageFrame(toPageRef(1))!.y,
      }).y,
    ).toBeCloseTo(PAD, 0);
  });

  it('initial-view providers still win over the default placement', () => {
    const { stage } = harness(PORTRAIT, undefined, { skipViewport: true });
    // A restoring provider registers before the first viewport report (at
    // open, plugins connect synchronously; the report is a later macrotask).
    stage.provideInitialView(50, () => ({
      ...stage.getSettings(),
      cursor: 3,
      anchor: { pageIndex: 3, fx: 0.5, fy: 0.5 },
    }));
    stage.setViewportSize({ width: 1000, height: 700 });
    expect(stage.getCurrentPageIndex()).toBe(3); // restored, not reset to page 0
  });
});

describe('goToPage', () => {
  it('scrolls to the TOP of the page, not its centre (vertical, home=start)', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPageIndex(2, { behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(2);
    const box = stage.getPageFrame(toPageRef(3))!; // page object number = index + 1
    // the page's top edge sits ~margin px below the viewport top
    expect(stage.worldToViewport({ x: box.x, y: box.y }).y).toBeCloseTo(24, 0);
  });
});

describe('fit modes use the document max page (not the current page)', () => {
  const MIXED = [
    { width: 600, height: 800 },
    { width: 600, height: 800 },
    { width: 2000, height: 800 }, // the widest
    { width: 600, height: 3000 }, // the tallest
  ];
  it('automatic fits the doc max WIDTH (capped at 100%), from the current page', () => {
    const { stage } = harness(MIXED);
    stage.goToPageIndex(0, { behavior: 'instant' }); // sit on a narrow page…
    stage.fitAutomatic();
    // …zoom derives from the document's max width (2000), width-only, capped at 100%
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 2000, 4);
  });
  it('fit-width and fit-page use max width / max height', () => {
    const { stage } = harness(MIXED);
    stage.fitWidth();
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 2000, 4);
    stage.fitPage();
    expect(stage.getZoomLevel()).toBeCloseTo(
      Math.min((1000 - 2 * PAD) / 2000, (700 - 2 * PAD) / 3000),
      4,
    );
  });
});

describe('anchor-preserving transitions', () => {
  it('keeps the current page when switching layout', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPageIndex(3, { behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(3);
    stage.setLayout('horizontal');
    expect(stage.getCurrentPageIndex()).toBe(3);
  });

  it('re-fits fit-width on viewport resize and keeps the page', () => {
    const { stage } = harness([
      { width: 2000, height: 800 },
      { width: 2000, height: 800 },
      { width: 2000, height: 800 },
    ]);
    stage.goToPageIndex(1, { behavior: 'instant' });
    stage.fitWidth();
    const zoomBefore = stage.getZoomLevel();
    stage.setViewportSize({ width: 2000, height: 700 }); // wider viewport
    const zoomAfter = stage.getZoomLevel();
    expect(zoomAfter).toBeGreaterThan(zoomBefore);
    expect(zoomAfter / zoomBefore).toBeCloseTo((2000 - 2 * PAD) / (1000 - 2 * PAD), 2);
    expect(stage.getCurrentPageIndex()).toBe(1);
  });
});

describe('bounded primitive', () => {
  it('bounded on clamps the camera to the content', () => {
    const { stage } = harness(PORTRAIT);
    stage.setCamera({ x: 0, y: 99999, zoom: 1 });
    expect(stage.getCamera().y).toBeLessThan(99999);
  });
  it('bounded off lets the camera pan freely (infinite canvas)', () => {
    const { stage } = harness(PORTRAIT);
    stage.updateSettings({ bounded: false });
    stage.setCamera({ x: 99999, y: 99999, zoom: 1 });
    expect(stage.getCamera()).toEqual({ x: 99999, y: 99999, zoom: 1 });
  });
});

describe('updateSettings()', () => {
  it('applies several settings in one change', () => {
    const { stage } = harness(PORTRAIT);
    stage.updateSettings({ layout: 'grid', bounded: false, zoom: { mode: 'fit-page' } });
    expect(stage.getSettings().layout).toBe('grid');
    expect(stage.getSettings().bounded).toBe(false);
    expect(stage.getZoomMode()).toBe('fit-page');
  });
});

describe('sizing: uniform + fit-width = flush per-page fit', () => {
  const MIXED = [
    { width: 600, height: 800 },
    { width: 1000, height: 700 },
    { width: 500, height: 900 },
  ];
  it('every page fills the same pane width, and the per-page scale is paneW/pageW', () => {
    const { stage } = harness(MIXED, { sizing: 'uniform' });
    stage.fitWidth();
    const zoom = stage.getZoomLevel();
    // all items are uniform width ⇒ same on-screen width = pane width minus gaps
    const onScreenWidth = (pageObjectNumber: number) =>
      stage.getPageFrame(toPageRef(pageObjectNumber))!.width * zoom;
    expect(onScreenWidth(1)).toBeCloseTo(1000 - 2 * PAD, 4);
    expect(onScreenWidth(2)).toBeCloseTo(1000 - 2 * PAD, 4);
    expect(onScreenWidth(3)).toBeCloseTo(1000 - 2 * PAD, 4);
    // effective per-page scale = contentScale × zoom = pane width / intrinsic width
    const effective = (pageObjectNumber: number) =>
      stage.getPageFrame(toPageRef(pageObjectNumber))!.contentScale * zoom;
    expect(effective(1)).toBeCloseTo((1000 - 2 * PAD) / 600, 4); // page 1 intrinsic width 600
    expect(effective(2)).toBeCloseTo((1000 - 2 * PAD) / 1000, 4);
    expect(effective(3)).toBeCloseTo((1000 - 2 * PAD) / 500, 4);
  });
});

describe('pageToWorld: page space → world space (the sizing-policy transform)', () => {
  const MIXED = [
    { width: 600, height: 800 },
    { width: 1000, height: 700 },
    { width: 500, height: 900 },
  ];

  it('uniform sizing maps page points through contentScale, not 1:1', () => {
    const { stage } = harness(MIXED, { sizing: 'uniform' });
    // uniform's reference is the widest page (object 2, scale 1); page 1 is
    // rescaled to match it, so a 1:1 mapping would be wrong
    const frame = stage.getPageFrame(toPageRef(1))!;
    expect(frame.contentScale).toBeCloseTo(1000 / 600, 4);
    // the page's intrinsic far corner must land on its world box corner
    const corner = stage.pageToWorld(toPageRef(1), { x: 600, y: 800 })!;
    expect(corner.x).toBeCloseTo(frame.x + frame.width, 4);
    expect(corner.y).toBeCloseTo(frame.y + frame.height, 4);
    // a hand-rolled frame.x + point.x would miss by (scale−1)·600
    expect(frame.x + 600).not.toBeCloseTo(corner.x, 0);
  });

  it('the menu sits on the dot: toScreen∘pageToWorld ≡ the page-surface math', () => {
    const { stage } = harness(MIXED, { sizing: 'uniform' });
    const marker = { x: 250, y: 333 }; // page-space, like a stored marker
    const frame = stage.getPageFrame(toPageRef(1))!;
    const camera = stage.getCamera();
    // what the page surface does: surface origin + point·(contentScale·zoom)
    const dot = {
      x: (frame.x - camera.x) * camera.zoom + marker.x * frame.contentScale * camera.zoom,
      y: (frame.y - camera.y) * camera.zoom + marker.y * frame.contentScale * camera.zoom,
    };
    const menu = stage.worldToViewport(stage.pageToWorld(toPageRef(1), marker)!);
    expect(menu.x).toBeCloseTo(dot.x, 4);
    expect(menu.y).toBeCloseTo(dot.y, 4);
  });

  it('returns null for an unknown page', () => {
    const { stage } = harness(MIXED);
    expect(stage.pageToWorld(toPageRef(99), { x: 0, y: 0 })).toBeNull();
    expect(
      stage.pageRectToViewport(toPageRef(99), { x: 0, y: 0, width: 10, height: 10 }),
    ).toBeNull();
  });
});

describe('document rotation: the stage honors PageLayout.rotation', () => {
  it('a rotated page reports a swapped display box via pageRect', () => {
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const frame = stage.getPageFrame(toPageRef(1))!;
    expect(frame.rotation).toBe(90);
    expect(frame.width).toBe(800); // portrait → landscape footprint
    expect(frame.height).toBe(600);
  });

  it('pageToWorld maps a content corner into the rotated display box', () => {
    // 90° clockwise: the content top-left (0,0) lands at the display box top-right.
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const frame = stage.getPageFrame(toPageRef(1))!; // intrinsic sizing → contentScale 1, display 800×600
    const topLeft = stage.pageToWorld(toPageRef(1), { x: 0, y: 0 })!;
    expect(topLeft.x).toBeCloseTo(frame.x + frame.width, 4); // top-right corner
    expect(topLeft.y).toBeCloseTo(frame.y, 4);
    // content bottom-left (0,800) → display top-left
    const bottomLeft = stage.pageToWorld(toPageRef(1), { x: 0, y: 800 })!;
    expect(bottomLeft.x).toBeCloseTo(frame.x, 4);
    expect(bottomLeft.y).toBeCloseTo(frame.y, 4);
    // an unrotated page maps 1:1
    const flat = harness([{ width: 600, height: 800 }]).stage;
    const flatFrame = flat.getPageFrame(toPageRef(1))!;
    expect(flat.pageToWorld(toPageRef(1), { x: 10, y: 20 })).toEqual({
      x: flatFrame.x + 10,
      y: flatFrame.y + 20,
    });
  });

  it('pageRectToViewport returns the viewport-space AABB of a rotated content rect', () => {
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const rect = { x: 100, y: 200, width: 80, height: 40 };
    const box = stage.pageRectToViewport(toPageRef(1), rect)!;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ].map((corner) => stage.worldToViewport(stage.pageToWorld(toPageRef(1), corner)!));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);

    expect(box.x).toBeCloseTo(Math.min(...xs), 4);
    expect(box.y).toBeCloseTo(Math.min(...ys), 4);
    expect(box.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 4);
    expect(box.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 4);
  });

  it('a rotated page changes which axis fit-width resolves against', () => {
    // a lone portrait rotated 90° fills the pane by its 800 (was height) edge
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    stage.fitWidth();
    expect(stage.getPageFrame(toPageRef(1))!.width * stage.getZoomLevel()).toBeCloseTo(
      1000 - 2 * PAD,
      4,
    );
  });
});

describe('refit: a runtime registry change (rotate/move/delete) re-resolves the zoom', () => {
  // The on-screen width of page 1: its display width × the resolved camera zoom.
  const widthPx = (stage: ReturnType<typeof harness>['stage']) =>
    stage.getPageFrame(toPageRef(1))!.width * stage.getZoomLevel();

  it('keeps `pageWidth: 110` exactly 110px wide across a 90° rotation', () => {
    const { stage, meta } = harness([{ width: 600, height: 800 }], {
      layout: 'vertical',
      zoom: { pageWidth: 110 },
    });
    expect(widthPx(stage)).toBeCloseTo(110, 4); // portrait: 600 × (110/600)

    // Rotate the page 90°: display width swaps 600 → 800, exactly as a rotate
    // event would, and bump the registry revision.
    meta.pages[0].rotation = 90;
    meta.revision += 1;
    stage.refit();

    // The zoom re-resolved against the 800-wide footprint, so width stays 110.
    expect(widthPx(stage)).toBeCloseTo(110, 4); // landscape: 800 × (110/800)
  });

  it('without refit the resolved zoom is stale', () => {
    const { stage, meta } = harness([{ width: 600, height: 800 }], {
      layout: 'vertical',
      zoom: { pageWidth: 110 },
    });
    meta.pages[0].rotation = 90;
    meta.revision += 1;
    // No refit(): the scene re-keys (display width is now 800) but the camera zoom still
    // targets the old 600 width → 800 × (110/600) ≈ 146.7px, not 110.
    expect(widthPx(stage)).toBeCloseTo((800 * 110) / 600, 4);
    expect(widthPx(stage)).not.toBeCloseTo(110, 1);
  });

  it('re-fits `fitPage` to the rotated footprint', () => {
    const { stage, meta } = harness([{ width: 600, height: 800 }], { layout: 'vertical' });
    stage.fitPage(); // portrait 600×800 in 1000×700: height-bound
    const before = stage.getZoomLevel();

    meta.pages[0].rotation = 90; // → landscape 800×600
    meta.revision += 1;
    stage.refit();

    // Still fits, now bound by the rotated height (600) against the viewport.
    expect(stage.getPageFrame(toPageRef(1))!.height * stage.getZoomLevel()).toBeCloseTo(
      700 - 2 * PAD,
      4,
    );
    expect(stage.getZoomLevel()).not.toBeCloseTo(before, 4);
  });

  it('is a no-op before the first placement (does not throw)', () => {
    const { stage } = harness([{ width: 600, height: 800 }], {}, { skipViewport: true });
    expect(() => stage.refit()).not.toThrow();
  });

  it('refits by itself when the registry revision changes (wired in connect)', () => {
    const { ctx, stage, meta } = harness([{ width: 600, height: 800 }], {
      layout: 'vertical',
      zoom: { pageWidth: 110 },
    });
    meta.pages[0].rotation = 90;
    meta.revision += 1;
    ctx.notify(); // the kernel's registry update wakes every watcher
    expect(widthPx(stage)).toBeCloseTo(110, 4);
  });
});

describe('flow: paged (same scene, smaller clamp rect — no index state)', () => {
  it('renders only the current item; next/prev step by item', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    expect(stage.getSettings().flow).toBe('paged');
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([0]);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([1]);
    stage.nextPage({ behavior: 'instant' });
    stage.previousPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('a pan cannot escape the current item', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.nextPage({ behavior: 'instant' }); // page 1
    stage.panBy(0, -100000); // try to scroll far past the page bottom
    expect(stage.getCurrentPageIndex()).toBe(1); // clamped to page 1's rect
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([1]);
  });

  it('fit-width fits the CURRENT page width, not the document max', () => {
    const { stage } = harness(
      [
        { width: 600, height: 800 },
        { width: 2000, height: 800 },
      ],
      { flow: 'paged' },
    );
    stage.goToPageIndex(0, { behavior: 'instant' });
    stage.fitWidth();
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 600, 4); // current page (600)
    stage.goToPageIndex(1, { behavior: 'instant' });
    stage.fitWidth();
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 2000, 4); // current page (2000)
  });

  it('spread paged shows a spread (two pages) as the current item', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged', spread: 'odd' });
    expect(stage.listCurrentItemPages().map((page) => page.index)).toEqual([0, 1]);
    expect(
      stage
        .listVisiblePages()
        .map((page) => page.pageIndex)
        .sort(),
    ).toEqual([0, 1]);
    stage.nextPage({ behavior: 'instant' });
    expect(stage.listCurrentItemPages().map((page) => page.index)).toEqual([2, 3]);
  });

  it('toggling flow keeps the current page (no index, page-durable handoff)', () => {
    const { stage } = harness(PORTRAIT); // continuous
    stage.goToPageIndex(3, { behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(3);
    stage.setFlow('paged');
    expect(stage.getSettings().flow).toBe('paged');
    expect(stage.getCurrentPageIndex()).toBe(3);
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([3]);
    stage.setFlow('continuous');
    expect(stage.getCurrentPageIndex()).toBe(3);
  });

  it('the page list with PDF labels comes from the document registry', () => {
    const { stage, meta } = harness(PORTRAIT);
    const pages = meta.pages;
    expect(pages.length).toBe(5);
    expect(pages[0]).toMatchObject({ index: 0, ref: toPageRef(1) });
  });

  // Paged flow is a one-item slice, so the page is structural and cannot be
  // replaced by panning, even when unbounded (construction, infinite canvas).
  it('paged + unbounded: panning far NEVER changes the page (construction)', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged', bounded: false });
    stage.goToPageIndex(2, { behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(2);
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([2]);
    // pan a huge distance every direction — unbounded, the camera roams freely
    stage.panBy(0, -50000);
    stage.panBy(0, -50000);
    stage.panBy(-40000, 0);
    expect(stage.getCurrentPageIndex()).toBe(2); // still page 2
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([2]); // never replaced
  });

  it('paged cursor round-trips through viewState (restore lands on the same page)', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.goToPageIndex(3, { behavior: 'instant' });
    const viewState = stage.getViewState();
    expect(viewState.cursor).toBe(3);
    const { stage: restored } = harness(PORTRAIT, { flow: 'paged' });
    restored.applyViewState(viewState);
    expect(restored.getCurrentPageIndex()).toBe(3);
    expect(restored.listVisiblePages().map((page) => page.pageIndex)).toEqual([3]);
  });
});

describe('smooth scroll via the injected scheduler', () => {
  it('tweens to the target across frames (deterministic, no real time)', () => {
    const frames: Array<(timestamp: number) => void> = [];
    const scheduler = {
      raf: (callback: (timestamp: number) => void) => {
        frames.push(callback);
        return frames.length;
      },
      caf: () => {},
    };
    const { stage } = harness(PORTRAIT, { scheduler });
    expect(frames.length).toBe(0); // placement was instant

    stage.goToPageIndex(4); // smooth (default)
    expect(frames.length).toBeGreaterThan(0);

    const run = (timestamp: number) => frames.splice(0).forEach((callback) => callback(timestamp));
    run(0); // first frame: k = 0
    run(120); // mid
    run(240); // final: k = 1 → at target
    expect(stage.getCurrentPageIndex()).toBe(4);
  });
});

describe('the scroller contract — the camera in native DOM vocabulary', () => {
  // 5 × 600×800 portrait pages, default gap 16 → world 600 × 4064; viewport 1000×700,
  // padding 24; automatic zoom caps at 1 → the y axis overflows, x fits.
  const WORLD_H = 5 * 800 + 4 * 16;

  it('reads like a DOM element, aligned with the pan clamp', () => {
    const { stage } = harness(PORTRAIT);
    const metrics = stage.getScrollMetrics();
    expect(metrics.scrollTop).toBeCloseTo(0, 4); // home: page 1 top at the gutter
    expect(metrics.scrollHeight).toBeCloseTo(WORLD_H + 2 * PAD, 4); // padded content extent
    expect(metrics.clientHeight).toBe(700);
    expect(metrics.scrollableY).toBe(true);
    expect(metrics.scrollableX).toBe(false); // 600 ≤ 1000 − 2·24: fits → native "no bar"
    expect(metrics.scrollWidth).toBeCloseTo(1000, 4);
    // pan to the very bottom: the clamp's floor is the scroller's max
    stage.panBy(0, -1e9);
    const bottom = stage.getScrollMetrics();
    expect(bottom.scrollTop).toBeCloseTo(bottom.scrollHeight - bottom.clientHeight, 4);
  });

  it('scrollTo is absolute + clamped; an omitted axis holds; scrollBy accumulates', () => {
    const { stage } = harness(PORTRAIT);
    stage.scrollTo({ top: 1500 });
    expect(stage.getScrollMetrics().scrollTop).toBeCloseTo(1500, 4);
    const cameraX = stage.getCamera().x;
    stage.scrollTo({ top: 1e9 }); // beyond the end → DOM max
    const metrics = stage.getScrollMetrics();
    expect(metrics.scrollTop).toBeCloseTo(metrics.scrollHeight - metrics.clientHeight, 4);
    expect(stage.getCamera().x).toBeCloseTo(cameraX, 6); // left untouched
    stage.scrollTo({ top: 1000 });
    stage.scrollBy({ top: -250 });
    expect(stage.getScrollMetrics().scrollTop).toBeCloseTo(750, 4);
  });

  it('scrolling syncs the cursor (manipulation: the camera leads)', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.scrollTo({ top: 2500 }); // deep into page 4's territory
    expect(stage.getCurrentPageIndex()).toBeGreaterThan(0);
  });

  it('zoom reshapes the range — and frees a fitting axis', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 2 });
    const metrics = stage.getScrollMetrics();
    expect(metrics.scrollableX).toBe(true); // 600·2 now overflows the viewport
    expect(metrics.scrollWidth).toBeCloseTo(600 * 2 + 2 * PAD, 4);
    expect(metrics.scrollHeight).toBeCloseTo(WORLD_H * 2 + 2 * PAD, 4);
  });

  it('unbounded: the range is the union of content and window (the Figma bar)', () => {
    const { stage } = harness(PORTRAIT);
    stage.updateSettings({ bounded: false });
    const before = stage.getScrollMetrics();
    stage.panBy(0, 2000); // pan the content down — the camera rises above it
    const away = stage.getScrollMetrics();
    expect(away.scrollTop).toBeCloseTo(0, 4); // window at the union's start
    expect(away.scrollHeight).toBeCloseTo(before.scrollHeight + 2000, 4); // range grew
    expect(away.scrollableY).toBe(true); // the bar remains a road back
    stage.scrollTo({ top: away.scrollHeight - away.clientHeight }); // ride it home…
    const back = stage.getScrollMetrics();
    expect(back.scrollHeight).toBeCloseTo(before.scrollHeight, 4); // …union re-collapses
  });

  it('paged flow scrolls the SLICE: the bar reflects one item, not the document', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    const metrics = stage.getScrollMetrics();
    // one 600×800 item at zoom 1: y = 848 total vs 700 viewport, x fits
    expect(metrics.scrollHeight).toBeCloseTo(800 + 2 * PAD, 4);
    expect(metrics.scrollableY).toBe(true);
    expect(metrics.scrollableX).toBe(false);
    stage.goToPageIndex(3, { behavior: 'instant' });
    expect(stage.getScrollMetrics().scrollHeight).toBeCloseTo(800 + 2 * PAD, 4); // same-size slice
  });

  it('smooth scrollTo tweens and syncs the cursor on arrival', () => {
    const frames: Array<(timestamp: number) => void> = [];
    const scheduler = {
      raf: (callback: (timestamp: number) => void) => {
        frames.push(callback);
        return frames.length;
      },
      caf: () => {},
    };
    const { stage } = harness(PORTRAIT, { scheduler });
    stage.scrollTo({ top: 2500, behavior: 'smooth' });
    expect(frames.length).toBeGreaterThan(0);
    const run = (timestamp: number) => frames.splice(0).forEach((callback) => callback(timestamp));
    run(0);
    run(120);
    expect(stage.getCurrentPageIndex()).toBe(0); // mid-tween: cursor not yet synced
    run(240);
    expect(stage.getScrollMetrics().scrollTop).toBeCloseTo(2500, 1);
    expect(stage.getCurrentPageIndex()).toBeGreaterThan(0); // synced on natural completion
  });

  it('the metrics reference is stable until a field moves (adapter equality)', () => {
    const { stage } = harness(PORTRAIT);
    const first = stage.getScrollMetrics();
    expect(stage.getScrollMetrics()).toBe(first); // no camera move → same object
    stage.scrollBy({ top: 10 });
    expect(stage.getScrollMetrics()).not.toBe(first);
  });
});

describe('arrival is ZOOM-INVARIANT: the landing rule never depends on magnification', () => {
  it('zoomed OUT, goToPage lands the page top at the gutter — same as zoomed in', () => {
    // Landing is policy, even when the page fits: start/start reads the same at
    // every zoom, and the next page peeks below (the Chrome/Acrobat continuous feel).
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 0.5 }); // page = 300x400, fits — but page 2 is off-screen
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    expect(stage.worldToViewport({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 0);
    // x has no real freedom (the scene fits) → the fitAlign rest keeps it centered
    expect(stage.worldToViewport({ x: box.x + box.width / 2, y: 0 }).x).toBeCloseTo(500, 0);
  });

  it('zoomed IN, goToPage goes to the page top-left (a padding out)', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 2 }); // page = 1200x1600, overflows both axes
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    const topLeft = stage.worldToViewport({ x: box.x, y: box.y });
    expect(topLeft.x).toBeCloseTo(PAD, 0);
    expect(topLeft.y).toBeCloseTo(PAD, 0);
  });

  it('center/center: the presentation feel is consistent too — centered at EVERY zoom', () => {
    const { stage } = harness(PORTRAIT, {
      arrivalAlign: { x: 'center', y: 'center' },
      bounded: false, // canvas feel — and proves placement needs no real clamp
    });
    for (const level of [0.5, 2]) {
      stage.zoomTo({ level });
      stage.goToPageIndex(2, { behavior: 'instant' });
      const box = stage.getPageFrame(toPageRef(3))!;
      const center = stage.worldToViewport({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
      expect(center.x).toBeCloseTo(500, 0);
      expect(center.y).toBeCloseTo(350, 0);
    }
  });

  it('a fraction lands the page center at that viewport line (the find-bar feel)', () => {
    const { stage } = harness(PORTRAIT, {
      arrivalAlign: { x: 'center', y: 0.35 },
      bounded: false,
      zoom: { level: 0.5 },
    });
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    expect(stage.worldToViewport({ x: 0, y: box.y + box.height / 2 }).y).toBeCloseTo(700 * 0.35, 0);
  });

  it("x:'keep' — page forward, hold the horizontal pan (two-column reading)", () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 2 },
      arrivalAlign: { x: 'keep', y: 'start' },
    });
    stage.goToPageIndex(0, { behavior: 'instant' });
    stage.panBy(-200, 0); // pan into the right column
    const x = stage.getCamera().x;
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
    expect(stage.getCamera().x).toBeCloseTo(x, 4); // the pan survived the page turn
    const box = stage.getPageFrame(toPageRef(2))!;
    expect(stage.worldToViewport({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 0); // y landed fresh
  });

  it('a per-call arrivalAlign overrides the setting for THIS arrival only', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 0.5 }, bounded: false });
    stage.goToPageIndex(2, { behavior: 'instant', arrivalAlign: { y: 'center' } });
    const box = stage.getPageFrame(toPageRef(3))!;
    expect(stage.worldToViewport({ x: 0, y: box.y + box.height / 2 }).y).toBeCloseTo(350, 0);
    stage.goToPageIndex(3, { behavior: 'instant' }); // back to the setting: top
    const nextBox = stage.getPageFrame(toPageRef(4))!;
    expect(stage.worldToViewport({ x: 0, y: nextBox.y }).y).toBeCloseTo(PAD, 0);
  });
});

describe('navigation units: spread when it fits, page when zoomed in', () => {
  // spread (cover): items [0], [1,2], [3,4]
  it('zoomed out (fit-page): next steps by SPREAD — 0 → 1 → 3', () => {
    const { stage } = harness(PORTRAIT, { spread: 'even' });
    stage.fitPage();
    stage.goToPageIndex(0, { behavior: 'instant' });
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(3); // skipped 2: pages 1+2 were one unit
    stage.previousPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('zoomed in: next steps by PAGE — 0 → 1 → 2 → 3, landing top-LEFT of each page', () => {
    const { stage } = harness(PORTRAIT, { spread: 'even' });
    stage.zoomTo({ level: 2 });
    stage.goToPageIndex(0, { behavior: 'instant' });
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
    // landed at page 1's start, not the spread's horizontal center
    const box = stage.getPageFrame(toPageRef(2))!; // object 2 = page index 1
    expect(stage.worldToViewport({ x: box.x, y: box.y }).x).toBeCloseTo(PAD, 0);
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(2); // walks into the spread
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(3);
  });

  it('paged + spread zoomed in: walks pages within the spread, then flips', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged', spread: 'even' });
    stage.goToPageIndex(1, { behavior: 'instant' }); // spread [1,2]
    stage.zoomTo({ level: 2 });
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(2); // same spread, camera moved to page 2
    expect(stage.listCurrentItemPages().map((page) => page.index)).toEqual([1, 2]);
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(3); // flipped to spread [3,4]
    expect(stage.listCurrentItemPages().map((page) => page.index)).toEqual([3, 4]);
  });
});

describe('cursor is THE current page in both flows', () => {
  it('continuous: scrolling syncs the cursor (indicator follows the camera)', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.panBy(0, -900); // scroll down ~a page
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('zoomed out, next/prev always progress (never stuck on a visible page)', () => {
    const { stage } = harness(PORTRAIT);
    stage.fitAll(); // everything visible: a visibility-based step would never leave page 0
    stage.goToPageIndex(0, { behavior: 'instant' }); // pin the indicator to page 0
    const before = stage.getCamera();
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1);
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(2);
    // structural no-op (not a visibility condition): under fit-all the canonical
    // placement is the centered scene, and that doesn't change between steps.
    expect(stage.getCamera()).toEqual(before);
  });
});

describe('fit-all (the construction overview)', () => {
  it('fits and centers the WHOLE scene', () => {
    const { stage } = harness(PORTRAIT, { layout: 'grid', bounded: false });
    stage.fitAll();
    const size = stage.getViewportSize();
    const center = stage.viewportToWorld({ x: size.width / 2, y: size.height / 2 });
    // viewport center = scene center, and every page is on screen
    const all = stage.listVisiblePages();
    expect(all.length).toBe(5);
    const sceneWidth = Math.max(...all.map((page) => page.x + page.width));
    const sceneHeight = Math.max(...all.map((page) => page.y + page.height));
    expect(center.x).toBeCloseTo(sceneWidth / 2, 0);
    expect(center.y).toBeCloseTo(sceneHeight / 2, 0);
    expect(sceneWidth * stage.getZoomLevel()).toBeLessThanOrEqual(size.width - 2 * PAD + 1);
    expect(sceneHeight * stage.getZoomLevel()).toBeLessThanOrEqual(size.height - 2 * PAD + 1);
  });
});

describe('cursor is INTENT: a clamped camera never revokes navigation', () => {
  // Horizontal, bounded, ~113%: pages near the document edges cannot be
  // centered, and a cursor synced from the camera would be stolen right back.
  const FOUR = Array.from({ length: 4 }, () => ({ width: 600, height: 800 }));
  const config = { layout: 'horizontal' as const, zoom: { level: 1.13 } };

  it('opens on page 1 — not on whatever page the clamped camera centers', () => {
    const { stage } = harness(FOUR, config);
    expect(stage.getCurrentPageIndex()).toBe(0); // intent: the start — even though the
    // viewport center sits over page 2 when the camera is pinned to the left edge
  });

  it('walks 1→2→3→4 and back 4→3→2→1, with the edges clamped', () => {
    const { stage } = harness(FOUR, config);
    const go = (verb: 'nextPage' | 'previousPage') => stage[verb]({ behavior: 'instant' });

    go('nextPage');
    expect(stage.getCurrentPageIndex()).toBe(1);
    go('nextPage');
    expect(stage.getCurrentPageIndex()).toBe(2);
    go('nextPage');
    expect(stage.getCurrentPageIndex()).toBe(3); // camera clamps at the right edge…
    const rightEdge = stage.getCamera().x;
    expect(rightEdge).toBeCloseTo(2448 - (1000 - 24) / 1.13, 0); // …but the cursor stays 4

    go('previousPage');
    expect(stage.getCurrentPageIndex()).toBe(2); // symmetric on the way back
    go('previousPage');
    expect(stage.getCurrentPageIndex()).toBe(1);
    go('previousPage');
    expect(stage.getCurrentPageIndex()).toBe(0); // page 1 is reachable again
    expect(stage.getCamera().x).toBeCloseTo(-24 / 1.13, 0); // clamped at the left edge
  });

  it('manipulation still derives the cursor (pan → indicator follows)', () => {
    const { stage } = harness(FOUR, config);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.panBy(-700, 0); // user scrolls right
    expect(stage.getCurrentPageIndex()).toBeGreaterThan(0); // derived from the camera
  });

  it('navigation is CANONICAL: visible-but-off-position targets still settle into place', () => {
    // At 80% the page fits the viewport on both axes; you are at the
    // right edge, the target is visible but off-position — prev must still settle it
    // at its canonical landing, exactly as it would at 115%. No visibility-dependent
    // behavior (and no zoom-dependent landing: start/start reads the same here).
    const { stage } = harness(FOUR, { layout: 'horizontal', zoom: { level: 0.8 } });
    stage.goToPageIndex(3, { behavior: 'instant' }); // camera clamps at the right edge
    stage.previousPage({ behavior: 'instant' }); // page 3 (index 2) is visible but off-position
    expect(stage.getCurrentPageIndex()).toBe(2);
    const box = stage.getPageFrame(toPageRef(3))!; // object 3 = page index 2
    // canonical landing: reading edge at the gutter (the scene overflows x, so
    // the arrival policy — not the clamp — decides)
    expect(stage.worldToViewport({ x: box.x, y: box.y }).x).toBeCloseTo(PAD, 0);
  });

  it('a smooth tween never flickers the cursor off its target', () => {
    const frames: Array<(timestamp: number) => void> = [];
    const scheduler = {
      raf: (callback: (timestamp: number) => void) => {
        frames.push(callback);
        return frames.length;
      },
      caf: () => {},
    };
    const { stage } = harness(FOUR, { ...config, scheduler });
    stage.goToPageIndex(3); // smooth
    expect(stage.getCurrentPageIndex()).toBe(3); // intent holds immediately
    const run = (timestamp: number) => frames.splice(0).forEach((callback) => callback(timestamp));
    run(0);
    run(120);
    expect(stage.getCurrentPageIndex()).toBe(3); // …and mid-tween
    run(240);
    expect(stage.getCurrentPageIndex()).toBe(3); // …and at the end
  });
});

describe('settingsEqual: registry-derived equality (the React selector contract)', () => {
  it('compares by VALUE one level deep — fresh-but-equal objects are equal', () => {
    const defaults = { ...DEFAULT_SETTINGS };
    // the same values in brand-new objects (what a settings patch produces)
    const copy = {
      ...DEFAULT_SETTINGS,
      pageFrame: { ...DEFAULT_SETTINGS.pageFrame },
      fitAlign: { ...DEFAULT_SETTINGS.fitAlign },
    };
    expect(settingsEqual(defaults, copy)).toBe(true);
    // a fresh zoom intent with the same level is equal (no pinch-tick re-renders)…
    expect(
      settingsEqual({ ...defaults, zoom: { level: 1 } }, { ...defaults, zoom: { level: 1 } }),
    ).toBe(true);
    // …and every changed value (primitive, union shape, or nested field) is not
    expect(settingsEqual(defaults, { ...defaults, padding: 32 })).toBe(false);
    expect(settingsEqual(defaults, { ...defaults, gap: { px: 12 } })).toBe(false);
    expect(settingsEqual(defaults, { ...defaults, zoom: { level: 1 } })).toBe(false);
    expect(settingsEqual(defaults, { ...defaults, fitAlign: { x: 'center', y: 'start' } })).toBe(
      false,
    );
  });
});

describe('arrivalAlign: where navigation lands', () => {
  it("{x:'end'}: zoomed-in navigation lands top-RIGHT", () => {
    const { stage } = harness(PORTRAIT, {
      arrivalAlign: { x: 'end', y: 'start' },
      zoom: { level: 2 },
    });
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    // page right edge sits a padding in from the viewport right edge; top a padding down
    expect(stage.worldToViewport({ x: box.x + box.width, y: box.y }).x).toBeCloseTo(1000 - PAD, 0);
    expect(stage.worldToViewport({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
  });

  it('Drawboard ({center,center}): zoomed-in navigation centers the page', () => {
    const { stage } = harness(PORTRAIT, {
      arrivalAlign: { x: 'center', y: 'center' },
      zoom: { level: 2 },
      bounded: false, // construction feel — and proves placement needs no real clamp
    });
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    const center = stage.worldToViewport({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(center.x).toBeCloseTo(500, 0);
    expect(center.y).toBeCloseTo(350, 0);
  });

  it('arrivalAlign is runtime-changeable and only affects the NEXT arrival', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 2 } });
    stage.goToPageIndex(1, { behavior: 'instant' });
    const before = stage.getCamera();
    stage.updateSettings({ arrivalAlign: { x: 'end', y: 'start' } });
    expect(stage.getCamera()).toEqual(before); // no camera jump on the setting change
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    expect(stage.worldToViewport({ x: box.x + box.width, y: box.y }).x).toBeCloseTo(1000 - PAD, 0);
  });
});

describe('zoomAlign: what a pointer-less zoom holds fixed', () => {
  it('default center/center: button zoom inflates around the viewport middle', () => {
    const { stage } = harness(PORTRAIT, { bounded: false });
    const before = stage.viewportToWorld({ x: 500, y: 350 });
    stage.zoomIn();
    const after = stage.viewportToWorld({ x: 500, y: 350 });
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it("y:'start': the first visible line holds still (text-editor zoom)", () => {
    const { stage } = harness(PORTRAIT, {
      bounded: false,
      zoomAlign: { x: 'center', y: 'start' },
    });
    // 'start' is the first content line — just inside the padding gutter, the
    // same spot an arrival puts the page top — not the absolute corner.
    const at = { x: 500, y: PAD };
    const before = stage.viewportToWorld(at);
    stage.zoomIn();
    const after = stage.viewportToWorld(at);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('zoomTo (no pointer) holds the SAME focal point as the buttons', () => {
    const { stage } = harness(PORTRAIT, { bounded: false, zoom: { level: 1 } });
    const before = stage.viewportToWorld({ x: 500, y: 350 });
    stage.zoomTo({ level: 1.7 });
    const after = stage.viewportToWorld({ x: 500, y: 350 });
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  it('pinch/wheel are physics: zoomAround honors ITS point, not the setting', () => {
    const { stage } = harness(PORTRAIT, {
      bounded: false,
      zoomAlign: { x: 'start', y: 'start' }, // a setting that would say otherwise
    });
    const point = { x: 800, y: 600 };
    const before = stage.viewportToWorld(point);
    stage.zoomAround(point, 1.5);
    const after = stage.viewportToWorld(point);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });
});

describe('anchorAlign: which viewport point survives a reframe', () => {
  it('default start/start: a growing container never shoves the document down', () => {
    const { stage } = harness(PORTRAIT); // automatic zoom resolves to 1
    stage.goToPageIndex(1, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(2))!;
    expect(stage.worldToViewport({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
    stage.setViewportSize({ width: 1000, height: 900 }); // the div finishes laying out
    // the top of the view is pinned; the extra height reveals more below
    expect(stage.worldToViewport({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
  });

  it('center/center — canvas-style symmetric resize (the Figma feel)', () => {
    const { stage } = harness(PORTRAIT, { anchorAlign: { x: 'center', y: 'center' } });
    stage.goToPageIndex(1, { behavior: 'instant' });
    const focus = stage.viewportToWorld({ x: 500, y: 350 }); // what sat at the old center…
    stage.setViewportSize({ width: 1000, height: 900 });
    const now = stage.worldToViewport(focus);
    expect(now.x).toBeCloseTo(500, 0); // …sits at the new center
    expect(now.y).toBeCloseTo(450, 0);
  });

  it('scene reframes (gap change) hold the anchorAlign point too', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 2 } });
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    expect(stage.worldToViewport({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
    stage.updateSettings({ gap: 64 }); // pages move in world space…
    const after = stage.getPageFrame(toPageRef(3))!;
    // …but the page-point at the top of the view stays at the top of the view
    expect(stage.worldToViewport({ x: after.x, y: after.y }).y).toBeCloseTo(PAD, 0);
  });
});

describe('fitAlign: where content RESTS on a fitting axis', () => {
  // the sidebar shape: content narrower & shorter than the viewport
  const FEW = Array.from({ length: 2 }, () => ({ width: 600, height: 800 }));

  it('default {center,center}: a fitting document rests centered', () => {
    const { stage } = harness(FEW, { zoom: { level: 0.25 } });
    const box = stage.getPageFrame(toPageRef(1))!;
    // content cross extent centered: page 1 center x at viewport center
    expect(stage.worldToViewport({ x: box.x + box.width / 2, y: 0 }).x).toBeCloseTo(500, 0);
  });

  it("y:'start': a few thumbnails hug the top, padding-exact (the sidebar)", () => {
    const { stage } = harness(FEW, {
      zoom: { level: 0.25 },
      fitAlign: { x: 'center', y: 'start' },
    });
    const box = stage.getPageFrame(toPageRef(1))!;
    expect(stage.worldToViewport({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 4); // top edge at the gutter
    expect(stage.worldToViewport({ x: box.x + box.width / 2, y: 0 }).x).toBeCloseTo(500, 0); // x stays centered
  });

  it("logical x: RTL + x:'start' rests at the RIGHT edge", () => {
    const { stage } = harness(FEW, {
      zoom: { level: 0.25 },
      direction: 'rtl',
      fitAlign: { x: 'start', y: 'start' },
    });
    const box = stage.getPageFrame(toPageRef(1))!;
    expect(stage.worldToViewport({ x: box.x + box.width, y: 0 }).x).toBeCloseTo(1000 - PAD, 4);
  });

  it('changing fitAlign re-clamps the camera in place (no navigation needed)', () => {
    const { stage } = harness(FEW, { zoom: { level: 0.25 } });
    const centered = stage.getCamera();
    stage.updateSettings({ fitAlign: { x: 'center', y: 'start' } });
    expect(stage.getCamera().y).not.toBeCloseTo(centered.y, 4); // moved up immediately
    const box = stage.getPageFrame(toPageRef(1))!;
    expect(stage.worldToViewport({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 4);
  });

  it('fitAlign never touches an OVERFLOWING axis (free scroll keeps its position)', () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 2 },
      fitAlign: { x: 'center', y: 'start' },
    });
    stage.goToPageIndex(1, { behavior: 'instant' });
    const before = stage.getCamera();
    stage.panBy(0, -50); // scroll down a bit on the overflowing y axis
    expect(stage.getCamera().y).toBeGreaterThan(before.y); // pan respected, not snapped back
  });
});

describe('gap: one value between items, every layout', () => {
  it('vertical layout: page 2 starts page-height + gap below page 1', () => {
    const { stage } = harness(PORTRAIT, { gap: 40 });
    expect(stage.getPageFrame(toPageRef(1))!.y).toBe(0);
    expect(stage.getPageFrame(toPageRef(2))!.y).toBeCloseTo(800 + 40, 6);
  });

  it('grid layout uses the SAME gap (no hidden 56)', () => {
    const { stage } = harness(PORTRAIT, { layout: 'grid', gap: 40 });
    const first = stage.getPageFrame(toPageRef(1))!;
    const second = stage.getPageFrame(toPageRef(2))!; // next column, same row
    expect(second.x - (first.x + first.width)).toBeCloseTo(40, 6);
  });

  it('gap is structural: changing it reflows but keeps the current page', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPageIndex(3, { behavior: 'instant' });
    stage.updateSettings({ gap: 64 });
    expect(stage.getCurrentPageIndex()).toBe(3);
    expect(stage.getPageFrame(toPageRef(2))!.y).toBeCloseTo(800 + 64, 6); // scene rebuilt with the new gap
  });
});

describe('direction: rtl — layout flips, navigation does not', () => {
  it('horizontal rtl: page 1 starts at the right; next moves the camera LEFT; cursor walks 0→1→2', () => {
    const { stage } = harness(PORTRAIT, {
      layout: 'horizontal',
      direction: 'rtl',
      zoom: { level: 1.13 },
    });
    expect(stage.getCurrentPageIndex()).toBe(0);
    // page 1 is the rightmost item in the scene
    const first = stage.getPageFrame(toPageRef(1))!;
    const last = stage.getPageFrame(toPageRef(5))!;
    expect(first.x).toBeGreaterThan(last.x);
    const startX = stage.getCamera().x;
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(1); // index-based navigation: unchanged
    expect(stage.getCamera().x).toBeLessThan(startX); // …but the camera moved left
    stage.nextPage({ behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(2);
  });

  it('vertical rtl + spread: page 1 binds on the right (all flows)', () => {
    const { stage } = harness(PORTRAIT, { spread: 'odd', direction: 'rtl' });
    expect(stage.getPageFrame(toPageRef(1))!.x).toBeGreaterThan(
      stage.getPageFrame(toPageRef(2))!.x,
    );
    // paged too: the slice inherits the swap
    stage.setFlow('paged');
    expect(stage.getPageFrame(toPageRef(1))!.x).toBeGreaterThan(
      stage.getPageFrame(toPageRef(2))!.x,
    );
  });

  it('logical align: the default start/start lands top-RIGHT in rtl (no auto needed)', () => {
    const { stage } = harness(PORTRAIT, { direction: 'rtl', zoom: { level: 2 } });
    stage.goToPageIndex(2, { behavior: 'instant' });
    const box = stage.getPageFrame(toPageRef(3))!;
    expect(stage.worldToViewport({ x: box.x + box.width, y: box.y }).x).toBeCloseTo(1000 - PAD, 0);
    expect(stage.worldToViewport({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
  });

  it('switching direction keeps the current page (structural, anchor-preserving)', () => {
    const { stage } = harness(PORTRAIT, { layout: 'horizontal' });
    stage.goToPageIndex(3, { behavior: 'instant' });
    stage.updateSettings({ direction: 'rtl' });
    expect(stage.getSettings().direction).toBe('rtl');
    expect(stage.getCurrentPageIndex()).toBe(3);
  });

  it('grid rtl: first page top-right, scene query renders the right pages', () => {
    const { stage } = harness(PORTRAIT, { layout: 'grid', direction: 'rtl' });
    stage.fitAll();
    const all = stage.listVisiblePages();
    expect(all.length).toBe(5);
    const firstPage = all.find((page) => page.pageIndex === 0)!;
    // page 1 occupies the rightmost cell of the top row
    expect(Math.max(...all.map((page) => page.x))).toBeCloseTo(firstPage.x, 6);
    expect(Math.min(...all.map((page) => page.y))).toBeCloseTo(firstPage.y, 6);
  });
});

describe("columns: 'auto' — the wrapped grid (thumbnail sidebar)", () => {
  // fixed zoom 0.2, padding 10, gap 12 → cell 612 world; line = (viewport width − 20) / 0.2
  const THUMBS = {
    layout: 'grid' as const,
    columns: 'auto' as const,
    zoom: { level: 0.2 },
    padding: 10,
    gap: 12,
  };

  it('narrow viewport → one column; wider → re-wraps to more', () => {
    const { stage } = harness(PORTRAIT, THUMBS, { skipViewport: true });
    stage.setViewportSize({ width: 160, height: 700 }); // line = 700 world → 1 column
    expect(stage.getPageFrame(toPageRef(2))!.x).toBeCloseTo(stage.getPageFrame(toPageRef(1))!.x, 6); // stacked
    expect(stage.getPageFrame(toPageRef(2))!.y).toBeGreaterThan(
      stage.getPageFrame(toPageRef(1))!.y,
    );

    stage.setViewportSize({ width: 270, height: 700 }); // line = 1250 → 2 columns
    expect(stage.getPageFrame(toPageRef(2))!.y).toBeCloseTo(stage.getPageFrame(toPageRef(1))!.y, 6); // side by side
    expect(stage.getPageFrame(toPageRef(3))!.y).toBeGreaterThan(
      stage.getPageFrame(toPageRef(1))!.y,
    ); // row 2

    stage.setViewportSize({ width: 400, height: 700 }); // line = 1900 → 3 columns
    expect(stage.getPageFrame(toPageRef(3))!.y).toBeCloseTo(stage.getPageFrame(toPageRef(1))!.y, 6);
  });

  it('re-wrapping keeps the current page (anchor-preserving resize)', () => {
    const { stage } = harness(PORTRAIT, THUMBS, { skipViewport: true });
    stage.setViewportSize({ width: 160, height: 400 });
    stage.goToPageIndex(4, { behavior: 'instant' });
    stage.setViewportSize({ width: 400, height: 400 }); // 1 → 3 columns
    expect(stage.getCurrentPageIndex()).toBe(4);
  });
});

describe('wrapped + discrete zoom: the scene re-wraps and the camera follows', () => {
  // viewport 1000, padding 24 → line = 952/zoom; cell = 600 + gap 16 = 616 world.
  // zoom 0.35 → line 2720 → 4 columns; ×1.2 → 0.42 → line 2266 → 3 columns.
  const WRAPPED = {
    layout: 'grid' as const,
    columns: 'auto' as const,
    zoom: { level: 0.35 },
    padding: 24,
    gap: 16,
  };

  it('zoomIn across a column boundary leaves the camera already clamped', () => {
    const { stage } = harness(PORTRAIT, WRAPPED);
    // 4 columns: page 4 (index 3) sits in row 0
    expect(stage.getPageFrame(toPageRef(4))!.y).toBeCloseTo(stage.getPageFrame(toPageRef(1))!.y, 6);
    stage.zoomIn();
    // re-wrapped to 3 columns: page 4 moved to row 1
    expect(stage.getPageFrame(toPageRef(4))!.y).toBeGreaterThan(
      stage.getPageFrame(toPageRef(1))!.y,
    );
    // the camera must satisfy the new scene's clamp immediately: a no-op pan
    // (which clamps) must not move it
    const settled = stage.getCamera();
    stage.panBy(0, 0);
    expect(stage.getCamera()).toEqual(settled);
  });

  it('zoom mode changes (fit-width, automatic) settle the wrap in one pass', () => {
    const { stage } = harness(PORTRAIT, WRAPPED); // level 0.35 → 4 columns
    stage.goToPageIndex(2, { behavior: 'instant' });
    stage.fitWidth(); // resolves to ~1.59 → re-wraps to a single column
    expect(stage.getCurrentPageIndex()).toBe(2); // the reapply never touches the cursor
    expect(stage.getPageFrame(toPageRef(2))!.y).toBeGreaterThan(
      stage.getPageFrame(toPageRef(1))!.y,
    ); // 1 column now
    // the camera must already satisfy the new scene's clamp: a no-op pan (which
    // clamps) must not move it
    const settled = stage.getCamera();
    stage.panBy(0, 0);
    expect(stage.getCamera()).toEqual(settled);
  });

  it('fit-all + wrapped converges too (the circular case, via reapply)', () => {
    const { stage } = harness(PORTRAIT, WRAPPED);
    stage.fitAll(); // zoom depends on scene size, scene size depends on zoom
    const settled = stage.getCamera();
    stage.panBy(0, 0);
    expect(stage.getCamera()).toEqual(settled); // legal against the scene it shows
  });

  it('the focal page-point stays under the cursor across the re-wrap (unbounded)', () => {
    // unbounded (the canvas/construction case): no clamp interference, so the
    // re-pin property is exact on both axes. Under bounds, the clamp wins wherever
    // the camera has no freedom — covered by the no-op-pan test above.
    const { stage } = harness(PORTRAIT, { ...WRAPPED, bounded: false });
    const before = stage.getPageFrame(toPageRef(2))!;
    const screenPoint = stage.worldToViewport({
      x: before.x + before.width * 0.25,
      y: before.y + before.height * 0.4,
    });
    stage.zoomAround(screenPoint, 1.2); // crosses the 4→3 column boundary
    const after = stage.getPageFrame(toPageRef(2))!; // page 2 has moved in the new wrap…
    const world = stage.viewportToWorld(screenPoint); // …but its page-point is back under the cursor
    expect((world.x - after.x) / after.width).toBeCloseTo(0.25, 3);
    expect((world.y - after.y) / after.height).toBeCloseTo(0.4, 3);
  });

  it('non-wrapped zoomAround is byte-identical (the scene reference never changes)', () => {
    const { stage } = harness(PORTRAIT, { bounded: false }); // unbounded: pure focal, no clamp
    const screenPoint = { x: 300, y: 200 };
    const worldBefore = stage.viewportToWorld(screenPoint);
    stage.zoomAround(screenPoint, 1.7);
    const worldAfter = stage.viewportToWorld(screenPoint);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 4); // pure focal zoom, no drift
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 4);
  });
});

describe('the stage is a LENS: multiple instances per document', () => {
  it('stagePlugin({id, token}) registers an independent instance', () => {
    const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs-test');
    const main = stagePlugin();
    const thumbs = stagePlugin({
      id: 'stage-thumbs',
      token: ThumbsToken,
      layout: 'grid',
      columns: 'auto',
      zoom: { level: 0.2 },
    });
    expect(main.id).toBe('stage');
    expect(thumbs.id).toBe('stage-thumbs');
    expect(thumbs.token).toBe(ThumbsToken);
    // each lens gets its own initial settings…
    const mainState = main.state!();
    const thumbState = thumbs.state!();
    expect(mainState.layout).toBe('vertical');
    expect(thumbState.layout).toBe('grid');
    expect(thumbState.columns).toBe('auto');
    // …and id/token do not leak into the settings state
    expect('id' in thumbState).toBe(false);
    expect('token' in thumbState).toBe(false);
  });

  it('two lenses over the same document hold independent cameras', () => {
    // two capabilities with separate state over the same document metadata,
    // as the kernel builds them for two registered stage plugins
    const { stage: main } = harness(PORTRAIT);
    const { stage: thumbs } = harness(PORTRAIT, {
      layout: 'grid',
      columns: 'auto',
      zoom: { level: 0.2 },
    });
    main.goToPageIndex(4, { behavior: 'instant' });
    expect(main.getCurrentPageIndex()).toBe(4);
    expect(thumbs.getCurrentPageIndex()).toBe(0); // the sidebar lens did not move
    expect(thumbs.getZoomLevel()).toBeCloseTo(0.2, 6);
    expect(main.getZoomLevel()).not.toBeCloseTo(0.2, 6);
  });
});

describe('zoom { pageWidth }: pixel-target thumbnails for ANY document', () => {
  const MIXED = [
    { width: 600, height: 800 },
    { width: 1000, height: 700 }, // the widest
    { width: 500, height: 900 },
  ];

  it('uniform + pageWidth: EVERY page renders exactly N screen px wide', () => {
    const { stage } = harness(MIXED, { sizing: 'uniform', zoom: { pageWidth: 200 } });
    const zoom = stage.getZoomLevel();
    expect(stage.getPageFrame(toPageRef(1))!.width * zoom).toBeCloseTo(200, 4);
    expect(stage.getPageFrame(toPageRef(2))!.width * zoom).toBeCloseTo(200, 4);
    expect(stage.getPageFrame(toPageRef(3))!.width * zoom).toBeCloseTo(200, 4);
  });

  it('the same config gives the same pixels for a totally different document', () => {
    const HUGE = [
      { width: 2880, height: 2000 }, // construction sheets
      { width: 2880, height: 2000 },
    ];
    const { stage } = harness(HUGE, { sizing: 'uniform', zoom: { pageWidth: 200 } });
    expect(stage.getPageFrame(toPageRef(1))!.width * stage.getZoomLevel()).toBeCloseTo(200, 4);
  });

  it('intrinsic + pageWidth: the WIDEST page is N px, narrower ones proportional', () => {
    const { stage } = harness(MIXED, { zoom: { pageWidth: 200 } }); // sizing intrinsic
    const zoom = stage.getZoomLevel();
    expect(stage.getPageFrame(toPageRef(2))!.width * zoom).toBeCloseTo(200, 4); // widest = 200
    expect(stage.getPageFrame(toPageRef(1))!.width * zoom).toBeCloseTo(120, 4); // 600/1000 of it
    expect(stage.getPageFrame(toPageRef(3))!.width * zoom).toBeCloseTo(100, 4);
  });

  it('paged + pageWidth: the CURRENT page is N px (per-page exact)', () => {
    const { stage } = harness(MIXED, { flow: 'paged', zoom: { pageWidth: 200 } });
    expect(stage.getPageFrame(toPageRef(1))!.width * stage.getZoomLevel()).toBeCloseTo(200, 4);
    stage.goToPageIndex(1, { behavior: 'instant' }); // the 1000-wide page
    expect(stage.getPageFrame(toPageRef(2))!.width * stage.getZoomLevel()).toBeCloseTo(200, 4);
  });

  it('wrapped + pageWidth converges (the thumbnail-sidebar config)', () => {
    const { stage } = harness(MIXED, {
      layout: 'grid',
      columns: 'auto',
      sizing: 'uniform',
      zoom: { pageWidth: 200 },
      padding: 10,
      gap: 12,
    });
    expect(stage.getPageFrame(toPageRef(1))!.width * stage.getZoomLevel()).toBeCloseTo(200, 4);
    const settled = stage.getCamera();
    stage.panBy(0, 0); // a no-op pan clamps — the camera must already be legal
    expect(stage.getCamera()).toEqual(settled);
  });
});

describe('gap: the value carries the unit — world (canvas) vs { px } (UI-stable)', () => {
  const screenGap = (stage: ReturnType<typeof harness>['stage']) => {
    const first = stage.getPageFrame(toPageRef(1))!;
    return (stage.getPageFrame(toPageRef(2))!.y - (first.y + first.height)) * stage.getZoomLevel();
  };

  it('a world gap scales with zoom — the whole canvas zooms as one rigid object', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 0.5 }, gap: 16 });
    expect(screenGap(stage)).toBeCloseTo(8, 4); // 16 world × 0.5
    stage.zoomTo({ level: 2 });
    expect(screenGap(stage)).toBeCloseTo(32, 4); // 16 world × 2 (the Drawboard feel)
  });

  it('a { px } gap is zoom-stable', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 0.5 }, gap: { px: 16 } });
    expect(screenGap(stage)).toBeCloseTo(16, 4);
    stage.zoomTo({ level: 2 });
    expect(screenGap(stage)).toBeCloseTo(16, 4);
  });

  it('{ px } + pageWidth: the same spacing in every document (the sidebar)', () => {
    // two documents with wildly different intrinsic sizes → different lens zooms
    const ebook = harness(PORTRAIT, { zoom: { pageWidth: 110 }, gap: { px: 12 } }).stage;
    const sheets = harness(
      Array.from({ length: 3 }, () => ({ width: 2880, height: 2000 })),
      { zoom: { pageWidth: 110 }, gap: { px: 12 } },
    ).stage;
    expect(ebook.getZoomLevel()).not.toBeCloseTo(sheets.getZoomLevel(), 4); // proves the zooms differ
    expect(screenGap(ebook)).toBeCloseTo(12, 3);
    expect(screenGap(sheets)).toBeCloseTo(12, 3);
  });

  it('{ px } under a fit mode converges (no-op pan invariant)', () => {
    const { stage } = harness(PORTRAIT, { zoom: { mode: 'fit-width' }, gap: { px: 12 } });
    const settled = stage.getCamera();
    stage.panBy(0, 0);
    expect(stage.getCamera()).toEqual(settled);
    expect(screenGap(stage)).toBeCloseTo(12, 3);
  });
});

describe('pageFrame (screen px): reserved chrome bands at the lens zoom', () => {
  it('px-exact bands at a fixed zoom level', () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 0.5 },
      pageFrame: { top: 10, right: 0, bottom: 30, left: 0 },
    });
    const first = stage.getPageFrame(toPageRef(1))!;
    const second = stage.getPageFrame(toPageRef(2))!;
    // world distance between pages = bottom/zoom + gap + top/zoom
    expect(second.y - (first.y + first.height)).toBeCloseTo(30 / 0.5 + 16 + 10 / 0.5, 4);
    // on screen that is exactly 30px + scaled gap + 10px: the bands are px-true
    expect((second.y - (first.y + first.height)) * stage.getZoomLevel()).toBeCloseTo(
      30 + 16 * 0.5 + 10,
      4,
    );
  });

  it('fit-page treats the OUTER box as the unit (chrome stays in view)', () => {
    const bare = harness(PORTRAIT, { zoom: { mode: 'fit-page' } }).stage.getZoomLevel();
    const chromed = harness(PORTRAIT, {
      zoom: { mode: 'fit-page' },
      pageFrame: { top: 0, right: 0, bottom: 40, left: 0 },
    }).stage.getZoomLevel();
    expect(chromed).toBeLessThan(bare); // zooms out to keep the band visible
  });

  it('wrapped + pageFrame converges (the thumbnail-sidebar config)', () => {
    const { stage } = harness(
      PORTRAIT,
      {
        layout: 'grid',
        columns: 'auto',
        sizing: 'uniform',
        zoom: { pageWidth: 110 },
        padding: 10,
        gap: 12,
        pageFrame: { top: 0, right: 0, bottom: 16, left: 0 },
      },
      { skipViewport: true },
    );
    stage.setViewportSize({ width: 140, height: 700 }); // narrow sidebar → 1 column
    const settled = stage.getCamera();
    stage.panBy(0, 0); // a no-op pan clamps — the camera must already be legal
    expect(stage.getCamera()).toEqual(settled);
    // single column: page 2 is below page 1, separated by the 16 screen px label
    // band plus the world gap
    const zoom = stage.getZoomLevel();
    expect(110 / zoom).toBeCloseTo(600, 0); // pageWidth target hit (110px wide thumbs)
    const first = stage.getPageFrame(toPageRef(1))!;
    const below = stage.getPageFrame(toPageRef(2))!.y - (first.y + first.height);
    expect(below * zoom).toBeCloseTo(16 + 12 * zoom, 1); // band(px) + gap(world→px)
  });

  it('reveal includes the chrome band (the label scrolls into view too)', () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 0.5 },
      pageFrame: { top: 0, right: 0, bottom: 30, left: 0 },
    });
    stage.revealIndex(3, { behavior: 'instant' });
    const rect = stage.getPageFrame(toPageRef(4))!; // object 4 = page index 3
    const outerBottom = rect.y + rect.height + 30 / 0.5; // page + its band
    // coming from above, reveal pins the outer bottom at the padded view edge
    expect(outerBottom).toBeCloseTo(stage.getCamera().y + (700 - PAD) / 0.5, 4);
  });
});

describe('reveal: make-visible without navigating (the sidebar follower verb)', () => {
  // thumbnail-style lens: small fixed thumbs, instant scrolling
  const THUMBS = {
    layout: 'grid' as const,
    columns: 1,
    zoom: { level: 0.2 },
    padding: 10,
    gap: 12,
  };

  it('off-screen page → minimal scroll; visible page → camera untouched', () => {
    const { stage } = harness(PORTRAIT, THUMBS); // 5 thumbs stacked, ~164px each
    const start = stage.getCamera();
    stage.revealIndex(4, { behavior: 'instant' }); // far below the 700px window
    const revealed = stage.getCamera();
    expect(revealed).not.toEqual(start);
    // minimal: page 5's bottom edge sits a padding above the viewport bottom
    const box = stage.getPageFrame(toPageRef(5))!;
    expect(stage.worldToViewport({ x: box.x, y: box.y + box.height }).y).toBeCloseTo(700 - 10, 0);
    // revealing it again — or a neighbour that's now visible — moves nothing
    stage.revealIndex(4, { behavior: 'instant' });
    expect(stage.getCamera()).toEqual(revealed);
    stage.revealIndex(3, { behavior: 'instant' });
    expect(stage.getCamera()).toEqual(revealed);
  });

  it('reveal is NOT navigation: the cursor never moves', () => {
    const { stage } = harness(PORTRAIT, THUMBS);
    expect(stage.getCurrentPageIndex()).toBe(0);
    stage.revealIndex(4, { behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(0); // intent untouched — only the camera moved
  });

  it('paged flow: revealing an off-scene page delegates to navigation', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.revealIndex(3, { behavior: 'instant' });
    expect(stage.getCurrentPageIndex()).toBe(3); // the page can only be seen by going there
    expect(stage.listVisiblePages().map((page) => page.pageIndex)).toEqual([3]);
  });
});

describe('viewpoint: per-page view memory (construction worksheets)', () => {
  it('goToPage with a saved viewpoint restores the exact camera', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.goToPageIndex(2, { behavior: 'instant' });
    stage.zoomAround({ x: 700, y: 500 }, 3); // zoom into "the bathroom"
    stage.panBy(-40, -60);
    const saved = stage.getViewpoint();
    const cameraBefore = stage.getCamera();

    stage.goToPageIndex(0, { behavior: 'instant' }); // go work on another floor
    expect(stage.getCurrentPageIndex()).toBe(0);

    stage.goToPageIndex(2, { behavior: 'instant', viewpoint: saved }); // come back
    expect(stage.getCurrentPageIndex()).toBe(2);
    expect(stage.getCamera().zoom).toBeCloseTo(cameraBefore.zoom, 4);
    expect(stage.getCamera().x).toBeCloseTo(cameraBefore.x, 2);
    expect(stage.getCamera().y).toBeCloseTo(cameraBefore.y, 2);
  });
});

describe('viewRotation: the NON-persistent view rotation (Adobe "Rotate View")', () => {
  it('rotates every page footprint and never touches the document', () => {
    const { stage, meta } = harness(PORTRAIT);
    const revisionBefore = meta.revision;
    stage.setViewRotation(90);
    const box = stage.getPageFrame(toPageRef(1))!;
    // 600×800 portrait displays landscape…
    expect(box.rotation).toBe(90);
    expect(box.width).toBeCloseTo(800, 0);
    expect(box.height).toBeCloseTo(600, 0);
    expect(box.transform.rotation).toBe(90);
    // …while the document stays exactly as it was: no /Rotate write, no revision
    // bump — this is a display setting of the lens, not an edit.
    expect(meta.pages[0].rotation).toBe(0);
    expect(meta.revision).toBe(revisionBefore);
    expect(stage.getSettings().viewRotation).toBe(90);
    expect(stage.getSettings().viewRotation).toBe(90); // in the settings snapshot (presets/persist)
  });

  it("composes with a page's own /Rotate (the TOTAL display rotation, mod 360)", () => {
    const { stage } = harness([
      { width: 600, height: 800, rotation: 90 },
      { width: 600, height: 800 },
    ]);
    stage.setViewRotation(90);
    // page 1: 90 (/Rotate) + 90 (view) = 180 → footprint back to portrait
    const first = stage.getPageFrame(toPageRef(1))!;
    expect(first.rotation).toBe(180);
    expect(first.width).toBeCloseTo(600, 0);
    // page 2: 0 + 90 → landscape
    const second = stage.getPageFrame(toPageRef(2))!;
    expect(second.rotation).toBe(90);
    expect(second.width).toBeCloseTo(800, 0);
  });

  it('rotateView steps a quarter-turn relative and wraps in both directions', () => {
    const { stage } = harness(PORTRAIT);
    stage.rotateViewBy(90);
    expect(stage.getSettings().viewRotation).toBe(90);
    stage.rotateViewBy(90);
    stage.rotateViewBy(90);
    stage.rotateViewBy(90);
    expect(stage.getSettings().viewRotation).toBe(0); // full circle
    stage.rotateViewBy(-90);
    expect(stage.getSettings().viewRotation).toBe(270); // wraps below zero
  });

  it('is an anchor-preserving reframe: the page you were on survives the turn', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPageIndex(3, { behavior: 'instant' });
    stage.rotateViewBy(90);
    expect(stage.getCurrentPageIndex()).toBe(3);
    // and fit-width now resolves against the swapped footprint (800, not 600)
    stage.fitWidth();
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 800, 3);
  });

  it('hit-testing round-trips under rotation, and pageAt reports the display rotation', () => {
    const { stage } = harness(PORTRAIT);
    stage.setViewRotation(90);
    const content = { x: 150, y: 400 }; // a content point on page 1 (un-rotated frame)
    const world = stage.pageToWorld(toPageRef(1), content)!;
    const hit = stage.getPageAt(stage.worldToViewport(world))!;
    expect(hit.ref).toEqual(toPageRef(1));
    expect(hit.rotation).toBe(90); // the total display rotation rides the sample
    expect(hit.point.x).toBeCloseTo(content.x, 1);
    expect(hit.point.y).toBeCloseTo(content.y, 1);
  });
});

describe("VisiblePage.visibleRect — visibility is the stage's data", () => {
  it('initial view (zoom 1, 1000×700 viewport): full width, 676pt of height', () => {
    const { stage } = harness(PORTRAIT);
    const page = stage.listVisiblePages()[0]!;
    // Page top sits a padding (24) below the viewport top at zoom 1 → the
    // visible page window is the full 600pt width × (700−24)pt of height.
    expect(page.visibleRect.x).toBeCloseTo(0, 0);
    expect(page.visibleRect.y).toBeCloseTo(0, 0);
    expect(page.visibleRect.width).toBeCloseTo(600, 0);
    expect(page.visibleRect.height).toBeCloseTo(676, 0);
  });

  it('zoomed in: a proper sub-rect that tracks the pan', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 4 });
    const before = stage.listVisiblePages()[0]!.visibleRect;
    // Deep zoom: far less than the page is visible (1000/4 = 250pt window).
    expect(before.width).toBeLessThan(600);
    expect(before.width).toBeGreaterThan(0);
    expect(before.height).toBeLessThan(800);
    // panBy is grab-and-drag: dragging content right slides the visible
    // window left in page space. Half a window's worth of drag.
    stage.panBy(before.width * stage.getCamera().zoom * 0.5, 0);
    const after = stage.listVisiblePages()[0]!.visibleRect;
    expect(after.x).toBeLessThan(before.x);
    expect(after.width).toBeCloseTo(before.width, 0);
  });

  it('rotated page: the sub-rect is expressed in UN-rotated page points', () => {
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const page = stage.listVisiblePages()[0]!;
    // Whole page visible at fit — the rect is the page's own point space,
    // not the rotated footprint's.
    expect(page.visibleRect.width).toBeCloseTo(600, 0);
    expect(page.visibleRect.height).toBeCloseTo(800, 0);
  });
});

// ── touch physics: gesture bracket, fling, double-tap ──
// A manual scheduler makes the fling and tween loops fully deterministic:
// `step(timestamp)` fires every currently queued frame callback with that timestamp.
function manualScheduler() {
  const queue = new Map<number, (timestamp: number) => void>();
  let lastHandle = 0;
  return {
    scheduler: {
      raf: (callback: (timestamp: number) => void) => {
        queue.set(++lastHandle, callback);
        return lastHandle;
      },
      caf: (handle: number) => {
        queue.delete(handle);
      },
    },
    step(timestamp: number) {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback(timestamp));
    },
    pending: () => queue.size,
  };
}

describe('gesture bracket (beginGesture/endGesture)', () => {
  it('defers the pinch zoom intent to endGesture: one settings patch per gesture', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.getZoomMode()).toBe('automatic');
    stage.beginGesture();
    stage.zoomAround({ x: 500, y: 350 }, 1.5);
    stage.zoomAround({ x: 500, y: 350 }, 1.1);
    // camera zoom moved live, but the intent is still the fit mode
    expect(stage.getZoomLevel()).toBeCloseTo(stage.getCamera().zoom, 6);
    expect(stage.getZoomMode()).toBe('automatic');
    stage.endGesture();
    // now the gesture's landing is recorded, once
    expect(stage.getZoomMode()).toBe('custom');
  });

  it('nests: only the OUTERMOST end commits', () => {
    const { stage } = harness(PORTRAIT);
    stage.beginGesture();
    stage.beginGesture();
    stage.zoomAround({ x: 500, y: 350 }, 2);
    stage.endGesture();
    expect(stage.getZoomMode()).toBe('automatic'); // still open
    stage.endGesture();
    expect(stage.getZoomMode()).toBe('custom');
  });

  it('a pan-only gesture commits no zoom intent', () => {
    const { stage } = harness(PORTRAIT);
    stage.beginGesture();
    stage.panBy(0, -200);
    stage.endGesture();
    expect(stage.getZoomMode()).toBe('automatic');
  });
});

describe('fling (momentum pan)', () => {
  it('decelerates on the UIScrollView curve and comes to rest', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const startY = stage.getCamera().y;
    stage.fling(0, -1000); // a 1000 px/s upward flick (content scrolls down)
    const deltas: number[] = [];
    let previousY = startY;
    let timestamp = 0;
    for (let i = 0; i < 1000 && clock.pending() > 0; i++) {
      clock.step(timestamp);
      timestamp += 16;
      const y = stage.getCamera().y;
      if (y !== previousY) deltas.push(y - previousY);
      previousY = y;
    }
    expect(clock.pending()).toBe(0); // it stopped on its own
    // it moved a long way (v0/λ ≈ 500 px at zoom 1), decelerating monotonically
    const total = stage.getCamera().y - startY;
    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(600);
    for (let i = 2; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1] + 1e-9);
    }
  });

  it('is caught by the next gesture (beginGesture cancels it)', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.fling(0, -1000);
    clock.step(0);
    clock.step(16);
    expect(stage.isMoving()).toBe(true);
    stage.beginGesture(); // the finger lands
    expect(stage.isMoving()).toBe(false);
    expect(clock.pending()).toBe(0);
    stage.endGesture();
  });

  it('BOUNCES off a content edge: overshoots, springs back, lands exactly at rest', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const startY = stage.getCamera().y; // resting at the top already
    stage.fling(0, 5000); // flick downward: content wants to move down — no room
    let timestamp = 0;
    let minY = startY;
    let frames = 0;
    while (clock.pending() > 0 && frames < 300) {
      clock.step(timestamp);
      timestamp += 16;
      minY = Math.min(minY, stage.getCamera().y);
      frames++;
    }
    expect(clock.pending()).toBe(0); // it settled on its own
    expect(minY).toBeLessThan(startY - 5); // the velocity became a visible overshoot…
    expect(stage.getCamera().y).toBeCloseTo(startY, 4); // …and the spring landed on the clamp
  });

  it('below the stop threshold nothing starts', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.fling(0, -10); // 10 px/s: imperceptible
    expect(clock.pending()).toBe(0);
  });
});

describe('doubleTapZoom', () => {
  // The ladder walks ascending reading postures derived from zoom intents:
  // automatic (see the page) → fit-width (read the text) → 2.5× the automatic
  // fit (inspect) → reset to the base. Stops within 10% collapse.
  const FIT_WIDTH = (1000 - 2 * PAD) / 600; // 1.586̄ in the `PORTRAIT` harness

  const settle = (clock: ReturnType<typeof manualScheduler>, from: number): number => {
    let timestamp = from;
    while (clock.pending() > 0 && timestamp < from + 5000) {
      clock.step(timestamp);
      timestamp += 16;
    }
    return timestamp;
  };

  it('climbs the ladder: automatic → fit-width → detail → reset to the base', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const base = stage.getZoomLevel(); // automatic fit (1: capped at 100%)
    let timestamp = 0;
    stage.doubleTapZoom({ x: 500, y: 350 });
    timestamp = settle(clock, timestamp);
    expect(stage.getZoomLevel()).toBeCloseTo(FIT_WIDTH, 3);
    expect(stage.getZoomMode()).toBe('custom');
    stage.doubleTapZoom({ x: 500, y: 350 });
    timestamp = settle(clock, timestamp);
    expect(stage.getZoomLevel()).toBeCloseTo(base * 2.5, 3);
    stage.doubleTapZoom({ x: 500, y: 350 });
    settle(clock, timestamp);
    expect(stage.getZoomLevel()).toBeCloseTo(base, 3);
  });

  it('zoomed far OUT, the first tap lands on the nearest posture above, not the top', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.zoomTo({ level: 0.5 });
    stage.doubleTapZoom({ x: 500, y: 350 });
    settle(clock, 0);
    expect(stage.getZoomLevel()).toBeCloseTo(1, 3); // the automatic fit, not 2.5
  });

  it('phone shape (automatic IS fit-width): the ladder degenerates to the familiar toggle', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.setViewportSize({ width: 393, height: 700 });
    // 393 < 600 → the default 'compact' responsive rule asserts padding 4
    const fitWidth = (393 - 2 * 4) / 600; // automatic == fit-width below 100%
    expect(stage.getZoomLevel()).toBeCloseTo(fitWidth, 4);
    let timestamp = 0;
    stage.doubleTapZoom({ x: 200, y: 350 });
    timestamp = settle(clock, timestamp);
    expect(stage.getZoomLevel()).toBeCloseTo(fitWidth * 2.5, 3); // one stop up — no dead rung
    stage.doubleTapZoom({ x: 200, y: 350 });
    settle(clock, timestamp);
    expect(stage.getZoomLevel()).toBeCloseTo(fitWidth, 3);
  });

  it('phone shape zoomed far out: the first tap restores fit-width (the platform feel)', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.setViewportSize({ width: 393, height: 700 });
    stage.zoomTo({ level: 0.3 });
    stage.doubleTapZoom({ x: 200, y: 350 });
    settle(clock, 0);
    expect(stage.getZoomLevel()).toBeCloseTo((393 - 2 * 4) / 600, 3); // compact padding
  });

  it('pinched IN between rungs: double-tap RESETS to the base fit, never climbs (iOS)', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.setViewportSize({ width: 393, height: 700 });
    const fitWidth = (393 - 2 * 4) / 600;
    stage.zoomTo({ level: fitWidth * 1.5 }); // a pinch left the ladder
    stage.doubleTapZoom({ x: 200, y: 350 });
    settle(clock, 0);
    expect(stage.getZoomLevel()).toBeCloseTo(fitWidth, 3); // back to reading, not detail
  });

  it('pinched BEYOND the top rung: double-tap also resets to the base fit', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.setViewportSize({ width: 393, height: 700 });
    const fitWidth = (393 - 2 * 4) / 600;
    stage.zoomTo({ level: fitWidth * 3.4 }); // past detail (2.5×)
    stage.doubleTapZoom({ x: 200, y: 350 });
    settle(clock, 0);
    expect(stage.getZoomLevel()).toBeCloseTo(fitWidth, 3);
  });

  it('"at a rung" tolerates ±10% fit drift — a near-fit zoom still climbs', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.setViewportSize({ width: 393, height: 700 });
    const fitWidth = (393 - 2 * 4) / 600;
    stage.zoomTo({ level: fitWidth * 1.05 }); // within the rung's band
    stage.doubleTapZoom({ x: 200, y: 350 });
    settle(clock, 0);
    expect(stage.getZoomLevel()).toBeCloseTo(fitWidth * 2.5, 3); // treated as on fit-width
  });

  it('desktop off-ladder reset lands on the base rung (automatic)', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    stage.zoomTo({ level: 2.0 }); // between fit-width (1.59) and detail (2.5)
    stage.doubleTapZoom({ x: 500, y: 350 });
    settle(clock, 0);
    expect(stage.getZoomLevel()).toBeCloseTo(1, 3);
  });
});

describe('doubleTapZoom interruption (catch) consistency', () => {
  it('commits the zoom intent UP FRONT — a caught tween never strands a fit intent', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    expect(stage.getZoomMode()).toBe('automatic');
    stage.doubleTapZoom({ x: 500, y: 350 });
    // the intent is already recorded, before a single frame runs
    expect(stage.getZoomMode()).toBe('custom');
    clock.step(0);
    clock.step(48); // a few frames in, mid-tween…
    stage.beginGesture(); // …the user catches it
    expect(stage.isMoving()).toBe(false);
    // camera sits at an intermediate zoom, and the stored intent agrees it is
    // a fixed level (no fit mode left behind to snap on the next refit)
    expect(stage.getZoomMode()).toBe('custom');
    stage.endGesture();
    // a later reframe converges to the recorded destination instead of
    // snapping back to the fit (the first ladder stop above automatic is
    // fit-width in this harness)
    stage.setViewportSize({ width: 900, height: 700 });
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 600, 3);
  });
});

describe('rubber-band overscroll (elastic gestures)', () => {
  it('an elastic pan STRETCHES past the clamp with resistance; a rigid one stops dead', () => {
    const { stage } = harness(PORTRAIT);
    const rest = stage.getCamera().y; // at the top
    // rigid gesture (mouse drag): the clamp holds
    stage.beginGesture();
    stage.panBy(0, 200); // drag down — no travel above the top
    expect(stage.getCamera().y).toBeCloseTo(rest, 6);
    stage.endGesture();
    // elastic gesture (touch): the camera stretches, but with resistance —
    // displaced, yet by less than the finger travelled
    stage.beginGesture({ elastic: true });
    stage.panBy(0, 200);
    const stretched = stage.getCamera().y;
    expect(stretched).toBeLessThan(rest); // displaced above the top edge
    expect(rest - stretched).toBeLessThan(200 / stage.getCamera().zoom); // …with resistance
    // more travel keeps stretching, asymptotically (never linearly)
    stage.panBy(0, 200);
    const stretchedFurther = stage.getCamera().y;
    expect(stretchedFurther).toBeLessThan(stretched);
    expect(stretched - stretchedFurther).toBeLessThan(rest - stretched);
    stage.endGesture();
  });

  it('release while stretched SPRINGS home to the exact clamp position', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const rest = stage.getCamera().y;
    stage.beginGesture({ elastic: true });
    stage.panBy(0, 300);
    expect(stage.getCamera().y).toBeLessThan(rest);
    stage.endGesture(); // released while stretched → the spring starts
    let timestamp = 0;
    let frames = 0;
    while (clock.pending() > 0 && frames < 300) {
      clock.step(timestamp);
      timestamp += 16;
      frames++;
    }
    expect(clock.pending()).toBe(0);
    expect(stage.getCamera().y).toBeCloseTo(rest, 4);
  });

  it('wheel pans (no gesture bracket) stay hard-clamped — desktop unchanged', () => {
    const { stage } = harness(PORTRAIT);
    const rest = stage.getCamera().y;
    stage.panBy(0, 500); // the wheel path: bare panBy
    expect(stage.getCamera().y).toBeCloseTo(rest, 6);
  });

  it('catching a mid-bounce stretch holds it and hands it to the finger', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const rest = stage.getCamera().y;
    stage.beginGesture({ elastic: true });
    stage.panBy(0, 300);
    stage.endGesture();
    clock.step(0);
    clock.step(48); // a few spring frames in — still displaced
    const midBounce = stage.getCamera().y;
    expect(midBounce).toBeLessThan(rest);
    stage.beginGesture({ elastic: true }); // the catch: spring cancelled
    expect(clock.pending()).toBe(0);
    expect(stage.getCamera().y).toBeCloseTo(midBounce, 6); // stretch held, not snapped
    // and further drag into the stretch keeps resisting from where it is
    stage.panBy(0, 100);
    expect(stage.getCamera().y).toBeLessThan(midBounce);
    stage.endGesture();
  });
});

describe('fitting axes stay RIGID (no overscroll without travel)', () => {
  // The platform rule (UIScrollView's default): the rubber softens only the
  // edges of a scroll range. An axis whose content fits the viewport has no
  // travel — it is held by the fit alignment and ignores tugs entirely.

  it('x fits, y travels: an elastic diagonal drag scrolls y but leaves x pinned', () => {
    const { stage } = harness(PORTRAIT); // 600 < 952 → x fits at zoom 1
    const rest = stage.getCamera();
    stage.beginGesture({ elastic: true });
    stage.panBy(120, -120); // rightward tug + normal downward scroll
    expect(stage.getCamera().x).toBeCloseTo(rest.x, 6); // rigid — no stretch
    expect(stage.getCamera().y).toBeGreaterThan(rest.y); // travel axis scrolls
    stage.endGesture();
  });

  it('EXACT fit-width (content*zoom === view − 2·padding): still rigid', () => {
    const { stage } = harness([{ width: 1200, height: 1600 }]); // automatic = fit-width
    const rest = stage.getCamera();
    expect(rest.zoom).toBeCloseTo((1000 - 2 * PAD) / 1200, 6);
    stage.beginGesture({ elastic: true });
    stage.panBy(150, 0);
    expect(stage.getCamera().x).toBeCloseTo(rest.x, 6);
    stage.endGesture();
  });

  it('whole document visible: drags move nothing and release starts no spring', () => {
    const clock = manualScheduler();
    const { stage } = harness([{ width: 600, height: 500 }], { scheduler: clock.scheduler });
    const rest = stage.getCamera();
    stage.beginGesture({ elastic: true });
    stage.panBy(100, 80);
    expect(stage.getCamera().x).toBeCloseTo(rest.x, 6);
    expect(stage.getCamera().y).toBeCloseTo(rest.y, 6);
    stage.endGesture();
    expect(clock.pending()).toBe(0); // nothing displaced → nothing to spring
  });

  it('a fling discards the fit-axis velocity: y glides, x never moves', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const rest = stage.getCamera();
    stage.fling(800, -600); // strong horizontal component into the fit axis
    let timestamp = 0;
    let frames = 0;
    while (clock.pending() > 0 && frames < 600) {
      clock.step(timestamp);
      timestamp += 16;
      frames++;
      expect(stage.getCamera().x).toBeCloseTo(rest.x, 6); // rigid at every frame
    }
    expect(clock.pending()).toBe(0);
    expect(stage.getCamera().y).toBeGreaterThan(rest.y); // the travel axis glided
  });

  it('an axis that STOPS fitting mid-gesture starts rubbering from the true finger position', () => {
    const { stage } = harness(PORTRAIT);
    stage.beginGesture({ elastic: true });
    stage.panBy(200, 0); // tug the fitting axis — rigid, but the raw integrates
    expect(stage.getCamera().x).toBeCloseTo(-200, 4); // centered rest at zoom 1
    stage.zoomAround({ x: 500, y: 350 }, 2); // now 600·2 > 952 → x travels
    stage.panBy(0, 0);
    // camera is somewhere sane inside/at travel — critically, no NaN and no jump
    expect(Number.isFinite(stage.getCamera().x)).toBe(true);
    stage.endGesture();
  });
});

describe('responsive settings (container queries for the settings bag)', () => {
  it('the DEFAULT rule: compact containers get the thin gutter, released on exit', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.getSettings().padding).toBe(24);
    expect(stage.matchesRule('compact')).toBe(false);
    stage.setViewportSize({ width: 500, height: 700 });
    expect(stage.getSettings().padding).toBe(4);
    expect(stage.matchesRule('compact')).toBe(true);
    expect(stage.listActiveRules()).toEqual(['compact']);
    stage.setViewportSize({ width: 1000, height: 700 });
    expect(stage.getSettings().padding).toBe(24);
    expect(stage.matchesRule('compact')).toBe(false);
  });

  it('space, not device: the rule resolves against THIS stage box (an embedded pane)', () => {
    const { stage } = harness(PORTRAIT, {}, { skipViewport: true });
    stage.setViewportSize({ width: 480, height: 900 }); // a narrow pane on a desktop
    expect(stage.getSettings().padding).toBe(4);
  });

  it('setters write the BASE: a matching rule wins until its rule stops matching', () => {
    const { stage } = harness(PORTRAIT);
    stage.setViewportSize({ width: 500, height: 700 }); // compact active
    stage.updateSettings({ padding: 40 });
    expect(stage.getSettings().padding).toBe(4); // the rule still wins
    stage.setViewportSize({ width: 1000, height: 700 }); // compact releases…
    expect(stage.getSettings().padding).toBe(40); // …and the base the setter wrote appears
  });

  it('interaction owns state between crossings: a pinched zoom survives a resize', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomAround({ x: 500, y: 350 }, 1.7); // user zoom → a custom level
    const pinched = stage.getZoomLevel();
    expect(pinched).toBeCloseTo(1.7, 4);
    stage.setViewportSize({ width: 500, height: 700 }); // crosses into compact
    expect(stage.getSettings().padding).toBe(4); // the rule asserted its key…
    expect(stage.getZoomLevel()).toBeCloseTo(pinched, 4); // …and left the pinch alone
  });

  it('a rule flipping a SCENE setting relayouts at the crossing (spread by orientation)', () => {
    const { stage } = harness(PORTRAIT, {
      spread: 'odd',
      responsive: [{ when: { orientation: 'portrait' }, settings: { spread: 'none' } }],
    });
    expect(stage.getSettings().spread).toBe('odd'); // 1000×700 is landscape
    stage.setViewportSize({ width: 600, height: 900 });
    expect(stage.getSettings().spread).toBe('none'); // the Books rotate behavior
    stage.setViewportSize({ width: 1000, height: 700 });
    expect(stage.getSettings().spread).toBe('odd');
  });

  it('multiple breakpoints compose, later winning per key', () => {
    const { stage } = harness(PORTRAIT, {
      responsive: [
        { name: 'medium', when: { maxWidth: 900 }, settings: { padding: 12 } },
        { name: 'small', when: { maxWidth: 600 }, settings: { padding: 4 } },
      ],
    });
    expect(stage.getSettings().padding).toBe(24);
    stage.setViewportSize({ width: 800, height: 700 });
    expect(stage.getSettings().padding).toBe(12);
    expect(stage.listActiveRules()).toEqual(['medium']);
    stage.setViewportSize({ width: 500, height: 700 });
    expect(stage.getSettings().padding).toBe(4);
    expect(stage.listActiveRules()).toEqual(['medium', 'small']);
  });

  it('responsive: [] opts out entirely', () => {
    const { stage } = harness(PORTRAIT, { responsive: [] });
    stage.setViewportSize({ width: 393, height: 700 });
    expect(stage.getSettings().padding).toBe(24);
    expect(stage.listActiveRules()).toEqual([]);
  });

  it('setResponsiveRules swaps the rules at runtime, releasing what no longer matches', () => {
    const { stage } = harness(PORTRAIT);
    stage.setViewportSize({ width: 500, height: 700 });
    expect(stage.getSettings().padding).toBe(4);
    stage.setResponsiveRules([{ name: 'tiny', when: { maxWidth: 400 }, settings: { padding: 2 } }]);
    expect(stage.getSettings().padding).toBe(24); // old rule gone, new one not matching
    expect(stage.matchesRule('compact')).toBe(false);
    stage.setViewportSize({ width: 350, height: 700 });
    expect(stage.getSettings().padding).toBe(2);
    expect(stage.matchesRule('tiny')).toBe(true);
  });

  it('applyViewState writes the BASE: a desktop snapshot restored on a phone stays compact', () => {
    const { stage } = harness(PORTRAIT);
    const saved = stage.getViewState(); // captured wide: padding 24 in the snapshot
    stage.setViewportSize({ width: 500, height: 700 });
    stage.applyViewState(saved);
    expect(stage.getSettings().padding).toBe(4); // the rule re-asserts over the restore
    stage.setViewportSize({ width: 1000, height: 700 });
    expect(stage.getSettings().padding).toBe(24); // and the snapshot's base is intact
  });
});

describe('doubleTapZoom animation — the focal point holds still by construction', () => {
  it('keeps the tapped content point stationary at EVERY tween frame', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const point = { x: 500, y: 350 };
    const world = stage.viewportToWorld(point); // the content under the tap
    stage.doubleTapZoom(point);
    let timestamp = 0;
    let maxDrift = 0;
    while (clock.pending() > 0 && timestamp < 2000) {
      clock.step(timestamp);
      timestamp += 16;
      const screen = stage.worldToViewport(world);
      maxDrift = Math.max(maxDrift, Math.hypot(screen.x - point.x, screen.y - point.y));
    }
    // linear coordinate lerping drifts this by tens of px mid-flight; the
    // anchored tween holds it to numeric noise
    expect(maxDrift).toBeLessThan(0.5);
    expect(stage.getZoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 600, 3); // first ladder stop
  });

  it('interpolates the zoom GEOMETRICALLY (constant rate), not linearly', () => {
    const clock = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: clock.scheduler });
    const startZoom = stage.getZoomLevel();
    const target = (1000 - 2 * PAD) / 600; // the first ladder stop above automatic
    stage.doubleTapZoom({ x: 500, y: 350 });
    clock.step(0); // the start anchor
    clock.step(120); // exact midpoint of the 240ms tween
    const ease = (progress: number) => 1 - Math.pow(1 - progress, 3);
    const expected = startZoom * Math.pow(target / startZoom, ease(0.5));
    expect(stage.getZoomLevel()).toBeCloseTo(expected, 4);
  });
});
