import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@embedpdf/core';
import { createStageCapability } from '../src/capability';
import { initialStageState, stageReducer } from '../src/reducer';
import { DEFAULT_SETTINGS, settingsEqual } from '../src/settings';
import { stagePlugin } from '../src/stage.plugin';
import type { StageAction, StageConfig, StageState } from '../src/types';

/**
 * Kernel-free harness: drive the real capability against the real reducer + real
 * stage-core, with a fake document and an injectable scheduler. No DOM, no async —
 * the whole Stage is deterministically testable because the core is pure.
 */
function harness(
  sizes: Array<{ width: number; height: number; rotation?: 0 | 90 | 180 | 270 }>,
  config: StageConfig = {},
  opts: { skipViewport?: boolean } = {},
) {
  const pages = sizes.map((s, i) => ({
    index: i,
    pageObjectNumber: i + 1,
    size: { width: s.width, height: s.height },
    rotation: s.rotation ?? 0,
    label: null,
    userUnit: 1,
    boxes: {},
  }));
  const meta = { id: 'doc', name: 'doc', pageCount: pages.length, pages, revision: 0 };
  // Test layout at 1:1 (world units = points) so absolute-size assertions read
  // cleanly; the 96/72 physical factor is exercised in the stage-core layout test.
  let state = initialStageState({ viewUnitsPerPoint: 1, ...config });
  const ctx = {
    id: 'stage',
    documentId: 'doc',
    doc: null,
    getState: () => state,
    dispatch: (a: StageAction) => {
      state = stageReducer(state, a);
    },
    subscribe: () => () => {},
    document: () => meta,
  } as unknown as PluginContext<StageState, StageAction>;

  const stage = createStageCapability(ctx, config);
  // Mirror the real lifecycle: the shell reports the viewport — initial placement
  // is level-triggered inside setViewport (no manual placeInitial; that's the fix
  // for the "page stuck at top-left until the first scroll" race).
  if (!opts.skipViewport) stage.setViewport({ width: 1000, height: 700 });
  // `meta` is the live registry the capability reads through `document()`. Mutating
  // a page's rotation + bumping `revision` simulates a rotate/move/delete event,
  // exactly as the kernel's event→registry bridge would (which the stage effect
  // then turns into a `refit()`).
  return { stage, meta };
}

const PORTRAIT = Array.from({ length: 5 }, () => ({ width: 600, height: 800 }));
const PAD = 24; // default StageSettings.padding — the fit inset + arrival gutter

describe('initial placement is level-triggered (the new-pane / HMR race)', () => {
  it('places the moment the viewport is reported — no effect/watch involved', () => {
    // The bug: placement hung off an edge-triggered width watch registered during
    // openDocument; if the viewport was already sized first, the edge never came and
    // the camera stayed at {0,0,1} (page flush top-left, no padding) until a scroll.
    const { stage } = harness(PORTRAIT); // harness never calls placeInitial
    const cam = stage.camera();
    expect(cam).not.toEqual({ x: 0, y: 0, zoom: 1 }); // NOT the untouched camera
    // page 1 is properly placed: horizontally centered, top a padding down
    const box = stage.pageRect(1)!;
    const center = stage.toScreen({ x: box.x + box.width / 2, y: box.y });
    expect(center.x).toBeCloseTo(500, 0);
    expect(center.y).toBeCloseTo(PAD, 0);
  });

  it('a half-laid-out viewport (height 0) does not place; the real one does', () => {
    const { stage } = harness(PORTRAIT, undefined, { skipViewport: true });
    stage.setViewport({ width: 1000, height: 0 }); // mid-layout flex collapse
    expect(stage.camera()).toEqual({ x: 0, y: 0, zoom: 1 }); // not placed yet
    stage.setViewport({ width: 1000, height: 700 }); // the real report
    expect(stage.camera()).not.toEqual({ x: 0, y: 0, zoom: 1 }); // placed now
    expect(stage.toScreen({ x: stage.pageRect(1)!.x, y: stage.pageRect(1)!.y }).y).toBeCloseTo(
      PAD,
      0,
    );
  });

  it('initial-view providers still win over the default placement', () => {
    const { stage } = harness(PORTRAIT, undefined, { skipViewport: true });
    // a restoring provider registers BEFORE the first viewport report (as in
    // openDocument: effects run synchronously; the report is a later macrotask)
    stage.provideInitialView(50, () => ({
      ...stage.settings(),
      cursor: 3,
      anchor: { pageIndex: 3, fx: 0.5, fy: 0.5 },
    }));
    stage.setViewport({ width: 1000, height: 700 });
    expect(stage.currentPage()).toBe(3); // restored, not reset to page 0
  });
});

describe('goToPage', () => {
  it('scrolls to the TOP of the page, not its centre (vertical, home=start)', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPage(2, { behavior: 'instant' });
    expect(stage.currentPage()).toBe(2);
    const box = stage.pageRect(3)!; // pon = index + 1
    // the page's top edge sits ~margin px below the viewport top
    expect(stage.toScreen({ x: box.x, y: box.y }).y).toBeCloseTo(24, 0);
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
    stage.goToPage(0, { behavior: 'instant' }); // sit on a narrow page…
    stage.automatic();
    // …zoom derives from the document's max width (2000), width-only, capped at 100%
    expect(stage.zoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 2000, 4);
  });
  it('fit-width and fit-page use max width / max height', () => {
    const { stage } = harness(MIXED);
    stage.fitWidth();
    expect(stage.zoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 2000, 4);
    stage.fitPage();
    expect(stage.zoomLevel()).toBeCloseTo(
      Math.min((1000 - 2 * PAD) / 2000, (700 - 2 * PAD) / 3000),
      4,
    );
  });
});

describe('anchor-preserving transitions', () => {
  it('keeps the current page when switching layout', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPage(3, { behavior: 'instant' });
    expect(stage.currentPage()).toBe(3);
    stage.setLayout('horizontal');
    expect(stage.currentPage()).toBe(3);
  });

  it('re-fits fit-width on viewport resize and keeps the page', () => {
    const { stage } = harness([
      { width: 2000, height: 800 },
      { width: 2000, height: 800 },
      { width: 2000, height: 800 },
    ]);
    stage.goToPage(1, { behavior: 'instant' });
    stage.fitWidth();
    const z1 = stage.zoomLevel();
    stage.setViewport({ width: 2000, height: 700 }); // wider viewport
    const z2 = stage.zoomLevel();
    expect(z2).toBeGreaterThan(z1);
    expect(z2 / z1).toBeCloseTo((2000 - 2 * PAD) / (1000 - 2 * PAD), 2);
    expect(stage.currentPage()).toBe(1);
  });
});

describe('bounded primitive', () => {
  it('bounded on clamps the camera to the content', () => {
    const { stage } = harness(PORTRAIT);
    stage.setCamera({ x: 0, y: 99999, zoom: 1 });
    expect(stage.camera().y).toBeLessThan(99999);
  });
  it('bounded off lets the camera pan freely (infinite canvas)', () => {
    const { stage } = harness(PORTRAIT);
    stage.setBounded(false);
    stage.setCamera({ x: 99999, y: 99999, zoom: 1 });
    expect(stage.camera()).toEqual({ x: 99999, y: 99999, zoom: 1 });
  });
});

describe('update()', () => {
  it('applies several settings in one change', () => {
    const { stage } = harness(PORTRAIT);
    stage.update({ layout: 'grid', bounded: false, zoom: { mode: 'fit-page' } });
    expect(stage.layout()).toBe('grid');
    expect(stage.bounded()).toBe(false);
    expect(stage.zoomMode()).toBe('fit-page');
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
    const zoom = stage.zoomLevel();
    // all items are uniform width ⇒ same on-screen width = pane width minus gaps
    const onScreenW = (pon: number) => stage.pageRect(pon)!.width * zoom;
    expect(onScreenW(1)).toBeCloseTo(1000 - 2 * PAD, 4);
    expect(onScreenW(2)).toBeCloseTo(1000 - 2 * PAD, 4);
    expect(onScreenW(3)).toBeCloseTo(1000 - 2 * PAD, 4);
    // the GitHub formula: effective per-page scale = contentScale*zoom = paneW/intrinsicW
    const effective = (pon: number) => stage.pageRect(pon)!.contentScale * zoom;
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
    // uniform's reference is the widest page (pon 2, scale 1) — pon 1 gets
    // rescaled to match it, which is exactly the case that broke the menu
    const pr = stage.pageRect(1)!;
    expect(pr.contentScale).toBeCloseTo(1000 / 600, 4);
    // the page's intrinsic far corner must land on its world box corner
    const corner = stage.pageToWorld(1, { x: 600, y: 800 })!;
    expect(corner.x).toBeCloseTo(pr.x + pr.width, 4);
    expect(corner.y).toBeCloseTo(pr.y + pr.height, 4);
    // hand-rolled pr.x + pt.x (the old menu math) would miss by (scale−1)·600
    expect(pr.x + 600).not.toBeCloseTo(corner.x, 0);
  });

  it('the menu sits on the dot: toScreen∘pageToWorld ≡ the page-surface math', () => {
    const { stage } = harness(MIXED, { sizing: 'uniform' });
    const markerPt = { x: 250, y: 333 }; // page-space, like a stored marker
    const pr = stage.pageRect(1)!;
    const cam = stage.camera();
    // what the page surface does: surface origin + pt·(contentScale·zoom)
    const dot = {
      x: (pr.x - cam.x) * cam.zoom + markerPt.x * pr.contentScale * cam.zoom,
      y: (pr.y - cam.y) * cam.zoom + markerPt.y * pr.contentScale * cam.zoom,
    };
    const menu = stage.toScreen(stage.pageToWorld(1, markerPt)!);
    expect(menu.x).toBeCloseTo(dot.x, 4);
    expect(menu.y).toBeCloseTo(dot.y, 4);
  });

  it('returns null for an unknown pon', () => {
    const { stage } = harness(MIXED);
    expect(stage.pageToWorld(99, { x: 0, y: 0 })).toBeNull();
    expect(stage.pageRectToScreen(99, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('document rotation: the stage honors PageLayout.rotation', () => {
  it('a rotated page reports a swapped display box via pageRect', () => {
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const pr = stage.pageRect(1)!;
    expect(pr.rotation).toBe(90);
    expect(pr.width).toBe(800); // portrait → landscape footprint
    expect(pr.height).toBe(600);
  });

  it('pageToWorld maps a content corner into the rotated display box', () => {
    // 90° CW: the content top-left (0,0) lands at the display box top-RIGHT.
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const pr = stage.pageRect(1)!; // intrinsic sizing → contentScale 1, display 800×600
    const topLeft = stage.pageToWorld(1, { x: 0, y: 0 })!;
    expect(topLeft.x).toBeCloseTo(pr.x + pr.width, 4); // top-right corner
    expect(topLeft.y).toBeCloseTo(pr.y, 4);
    // content bottom-left (0,800) → display top-left
    const bottomLeft = stage.pageToWorld(1, { x: 0, y: 800 })!;
    expect(bottomLeft.x).toBeCloseTo(pr.x, 4);
    expect(bottomLeft.y).toBeCloseTo(pr.y, 4);
    // round-trips back to 0° behaviour when unrotated
    const flat = harness([{ width: 600, height: 800 }]).stage;
    const fr = flat.pageRect(1)!;
    expect(flat.pageToWorld(1, { x: 10, y: 20 })).toEqual({ x: fr.x + 10, y: fr.y + 20 });
  });

  it('pageRectToScreen returns the screen-space AABB of a rotated content rect', () => {
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const rect = { x: 100, y: 200, width: 80, height: 40 };
    const box = stage.pageRectToScreen(1, rect)!;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ].map((p) => stage.toScreen(stage.pageToWorld(1, p)!));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);

    expect(box.x).toBeCloseTo(Math.min(...xs), 4);
    expect(box.y).toBeCloseTo(Math.min(...ys), 4);
    expect(box.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 4);
    expect(box.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 4);
  });

  it('a rotated page changes which axis fit-width resolves against', () => {
    // a lone portrait rotated 90° fills the pane by its 800 (was height) edge
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    stage.fitWidth();
    expect(stage.pageRect(1)!.width * stage.zoomLevel()).toBeCloseTo(1000 - 2 * PAD, 4);
  });
});

describe('refit: a runtime registry change (rotate/move/delete) re-resolves the zoom', () => {
  // On-screen width of page pon=1 = its display width × the resolved camera zoom.
  const widthPx = (stage: ReturnType<typeof harness>['stage']) =>
    stage.pageRect(1)!.width * stage.zoomLevel();

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

  it('without refit the resolved zoom is stale (the bug this fixes)', () => {
    const { stage, meta } = harness([{ width: 600, height: 800 }], {
      layout: 'vertical',
      zoom: { pageWidth: 110 },
    });
    meta.pages[0].rotation = 90;
    meta.revision += 1;
    // No refit(): the scene re-keys (display width is now 800) but cam.zoom still
    // targets the old 600 width → 800 × (110/600) ≈ 146.7px, not 110.
    expect(widthPx(stage)).toBeCloseTo((800 * 110) / 600, 4);
    expect(widthPx(stage)).not.toBeCloseTo(110, 1);
  });

  it('re-fits `fitPage` to the rotated footprint', () => {
    const { stage, meta } = harness([{ width: 600, height: 800 }], { layout: 'vertical' });
    stage.fitPage(); // portrait 600×800 in 1000×700: height-bound
    const before = stage.zoomLevel();

    meta.pages[0].rotation = 90; // → landscape 800×600
    meta.revision += 1;
    stage.refit();

    // Still fits, now bound by the rotated height (600) against the viewport.
    expect(stage.pageRect(1)!.height * stage.zoomLevel()).toBeCloseTo(700 - 2 * PAD, 4);
    expect(stage.zoomLevel()).not.toBeCloseTo(before, 4);
  });

  it('is a no-op before the first placement (does not throw)', () => {
    const { stage } = harness([{ width: 600, height: 800 }], {}, { skipViewport: true });
    expect(() => stage.refit()).not.toThrow();
  });
});

describe('flow: paged (same scene, smaller clamp rect — no index state)', () => {
  it('renders only the current item; next/prev step by item', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    expect(stage.flow()).toBe('paged');
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([0]);
    expect(stage.currentPage()).toBe(0);
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([1]);
    stage.next({ behavior: 'instant' });
    stage.prev({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
  });

  it('a pan cannot escape the current item', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.next({ behavior: 'instant' }); // page 1
    stage.panBy(0, -100000); // try to scroll far past the page bottom
    expect(stage.currentPage()).toBe(1); // clamped to page 1's rect
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([1]);
  });

  it('fit-width fits the CURRENT page width, not the document max', () => {
    const { stage } = harness(
      [
        { width: 600, height: 800 },
        { width: 2000, height: 800 },
      ],
      { flow: 'paged' },
    );
    stage.goToPage(0, { behavior: 'instant' });
    stage.fitWidth();
    expect(stage.zoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 600, 4); // current page (600)
    stage.goToPage(1, { behavior: 'instant' });
    stage.fitWidth();
    expect(stage.zoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 2000, 4); // current page (2000)
  });

  it('spread paged shows a spread (two pages) as the current item', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged', spread: 'odd' });
    expect(stage.currentItemPages()).toEqual([0, 1]);
    expect(
      stage
        .visiblePages()
        .map((p) => p.pageIndex)
        .sort(),
    ).toEqual([0, 1]);
    stage.next({ behavior: 'instant' });
    expect(stage.currentItemPages()).toEqual([2, 3]);
  });

  it('toggling flow keeps the current page (no index, page-durable handoff)', () => {
    const { stage } = harness(PORTRAIT); // continuous
    stage.goToPage(3, { behavior: 'instant' });
    expect(stage.currentPage()).toBe(3);
    stage.setFlow('paged');
    expect(stage.flow()).toBe('paged');
    expect(stage.currentPage()).toBe(3);
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([3]);
    stage.setFlow('continuous');
    expect(stage.currentPage()).toBe(3);
  });

  it('pages() exposes the page list with PDF labels', () => {
    const { stage } = harness(PORTRAIT);
    const pages = stage.pages();
    expect(pages.length).toBe(5);
    expect(pages[0]).toMatchObject({ index: 0, pon: 1 });
  });

  // The Option 2 property: paged is a one-item slice, so the page is structural and
  // CANNOT be replaced by panning — even when unbounded (construction / infinite canvas).
  it('paged + unbounded: panning far NEVER changes the page (construction)', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged', bounded: false });
    stage.goToPage(2, { behavior: 'instant' });
    expect(stage.currentPage()).toBe(2);
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([2]);
    // pan a huge distance every direction — unbounded, the camera roams freely
    stage.panBy(0, -50000);
    stage.panBy(0, -50000);
    stage.panBy(-40000, 0);
    expect(stage.currentPage()).toBe(2); // still page 2
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([2]); // never replaced
  });

  it('paged cursor round-trips through viewState (restore lands on the same page)', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.goToPage(3, { behavior: 'instant' });
    const vs = stage.viewState();
    expect(vs.cursor).toBe(3);
    const { stage: restored } = harness(PORTRAIT, { flow: 'paged' });
    restored.applyViewState(vs);
    expect(restored.currentPage()).toBe(3);
    expect(restored.visiblePages().map((p) => p.pageIndex)).toEqual([3]);
  });
});

describe('smooth scroll via the injected scheduler', () => {
  it('tweens to the target across frames (deterministic, no real time)', () => {
    const frames: Array<(t: number) => void> = [];
    const scheduler = {
      raf: (cb: (t: number) => void) => {
        frames.push(cb);
        return frames.length;
      },
      caf: () => {},
    };
    const { stage } = harness(PORTRAIT, { scheduler });
    expect(frames.length).toBe(0); // placement was instant

    stage.goToPage(4); // smooth (default)
    expect(frames.length).toBeGreaterThan(0);

    const run = (t: number) => frames.splice(0).forEach((cb) => cb(t));
    run(0); // first frame: k = 0
    run(120); // mid
    run(240); // final: k = 1 → at target
    expect(stage.currentPage()).toBe(4);
  });
});

describe('the scroller contract — the camera in native DOM vocabulary', () => {
  // 5 × 600×800 portrait pages, default gap 16 → world 600 × 4064; vp 1000×700,
  // padding 24; automatic zoom caps at 1 → the y axis overflows, x fits.
  const WORLD_H = 5 * 800 + 4 * 16;

  it('reads like a DOM element, aligned with the pan clamp', () => {
    const { stage } = harness(PORTRAIT);
    const m = stage.scrollMetrics();
    expect(m.scrollTop).toBeCloseTo(0, 4); // home: page 1 top at the gutter
    expect(m.scrollHeight).toBeCloseTo(WORLD_H + 2 * PAD, 4); // padded content extent
    expect(m.clientHeight).toBe(700);
    expect(m.scrollableY).toBe(true);
    expect(m.scrollableX).toBe(false); // 600 ≤ 1000 − 2·24: fits → native "no bar"
    expect(m.scrollWidth).toBeCloseTo(1000, 4);
    // pan to the very bottom: the clamp's floor IS the scroller's max
    stage.panBy(0, -1e9);
    const bot = stage.scrollMetrics();
    expect(bot.scrollTop).toBeCloseTo(bot.scrollHeight - bot.clientHeight, 4);
  });

  it('scrollTo is absolute + clamped; an omitted axis holds; scrollBy accumulates', () => {
    const { stage } = harness(PORTRAIT);
    stage.scrollTo({ top: 1500 });
    expect(stage.scrollMetrics().scrollTop).toBeCloseTo(1500, 4);
    const camX = stage.camera().x;
    stage.scrollTo({ top: 1e9 }); // beyond the end → DOM max
    const m = stage.scrollMetrics();
    expect(m.scrollTop).toBeCloseTo(m.scrollHeight - m.clientHeight, 4);
    expect(stage.camera().x).toBeCloseTo(camX, 6); // left untouched
    stage.scrollTo({ top: 1000 });
    stage.scrollBy({ top: -250 });
    expect(stage.scrollMetrics().scrollTop).toBeCloseTo(750, 4);
  });

  it('scrolling syncs the cursor (manipulation: the camera leads)', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.currentPage()).toBe(0);
    stage.scrollTo({ top: 2500 }); // deep into page 4's territory
    expect(stage.currentPage()).toBeGreaterThan(0);
  });

  it('zoom reshapes the range — and frees a fitting axis', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 2 });
    const m = stage.scrollMetrics();
    expect(m.scrollableX).toBe(true); // 600·2 now overflows the viewport
    expect(m.scrollWidth).toBeCloseTo(600 * 2 + 2 * PAD, 4);
    expect(m.scrollHeight).toBeCloseTo(WORLD_H * 2 + 2 * PAD, 4);
  });

  it('unbounded: the range is the union of content and window (the Figma bar)', () => {
    const { stage } = harness(PORTRAIT);
    stage.setBounded(false);
    const before = stage.scrollMetrics();
    stage.panBy(0, 2000); // pan the content DOWN — the camera rises above it
    const away = stage.scrollMetrics();
    expect(away.scrollTop).toBeCloseTo(0, 4); // window at the union's start
    expect(away.scrollHeight).toBeCloseTo(before.scrollHeight + 2000, 4); // range grew
    expect(away.scrollableY).toBe(true); // the bar remains a road back
    stage.scrollTo({ top: away.scrollHeight - away.clientHeight }); // ride it home…
    const back = stage.scrollMetrics();
    expect(back.scrollHeight).toBeCloseTo(before.scrollHeight, 4); // …union re-collapses
  });

  it('paged flow scrolls the SLICE: the bar reflects one item, not the document', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    const m = stage.scrollMetrics();
    // one 600×800 item at zoom 1: y = 848 total vs 700 viewport, x fits
    expect(m.scrollHeight).toBeCloseTo(800 + 2 * PAD, 4);
    expect(m.scrollableY).toBe(true);
    expect(m.scrollableX).toBe(false);
    stage.goToPage(3, { behavior: 'instant' });
    expect(stage.scrollMetrics().scrollHeight).toBeCloseTo(800 + 2 * PAD, 4); // same-size slice
  });

  it('smooth scrollTo tweens and syncs the cursor on arrival', () => {
    const frames: Array<(t: number) => void> = [];
    const scheduler = {
      raf: (cb: (t: number) => void) => {
        frames.push(cb);
        return frames.length;
      },
      caf: () => {},
    };
    const { stage } = harness(PORTRAIT, { scheduler });
    stage.scrollTo({ top: 2500, behavior: 'smooth' });
    expect(frames.length).toBeGreaterThan(0);
    const run = (t: number) => frames.splice(0).forEach((cb) => cb(t));
    run(0);
    run(120);
    expect(stage.currentPage()).toBe(0); // mid-tween: cursor not yet synced
    run(240);
    expect(stage.scrollMetrics().scrollTop).toBeCloseTo(2500, 1);
    expect(stage.currentPage()).toBeGreaterThan(0); // synced on natural completion
  });

  it('the metrics reference is stable until a field moves (adapter equality)', () => {
    const { stage } = harness(PORTRAIT);
    const a = stage.scrollMetrics();
    expect(stage.scrollMetrics()).toBe(a); // no camera move → same object
    stage.scrollBy({ top: 10 });
    expect(stage.scrollMetrics()).not.toBe(a);
  });
});

describe('arrival is ZOOM-INVARIANT: the landing rule never depends on magnification', () => {
  it('zoomed OUT, goToPage lands the page top at the gutter — same as zoomed in', () => {
    // The old model flipped here (fitting page → centered); landing is now
    // policy: start/start reads the same at every zoom. The next page peeks
    // below — the Chrome/Acrobat continuous feel.
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 0.5 }); // page = 300x400, fits — but page 2 is OFF-screen
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    expect(stage.toScreen({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 0);
    // x has no real freedom (the SCENE fits) → the fitAlign rest keeps it centered
    expect(stage.toScreen({ x: box.x + box.width / 2, y: 0 }).x).toBeCloseTo(500, 0);
  });

  it('zoomed IN, goToPage goes to the page top-left (a padding out)', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 2 }); // page = 1200x1600, overflows both axes
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    const topLeft = stage.toScreen({ x: box.x, y: box.y });
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
      stage.goToPage(2, { behavior: 'instant' });
      const box = stage.pageRect(3)!;
      const center = stage.toScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
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
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    expect(stage.toScreen({ x: 0, y: box.y + box.height / 2 }).y).toBeCloseTo(700 * 0.35, 0);
  });

  it("x:'keep' — page forward, hold the horizontal pan (two-column reading)", () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 2 },
      arrivalAlign: { x: 'keep', y: 'start' },
    });
    stage.goToPage(0, { behavior: 'instant' });
    stage.panBy(-200, 0); // pan into the right column
    const x = stage.camera().x;
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
    expect(stage.camera().x).toBeCloseTo(x, 4); // the pan survived the page turn
    const box = stage.pageRect(2)!;
    expect(stage.toScreen({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 0); // y landed fresh
  });

  it('a per-call arrivalAlign overrides the setting for THIS arrival only', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 0.5 }, bounded: false });
    stage.goToPage(2, { behavior: 'instant', arrivalAlign: { y: 'center' } });
    const box = stage.pageRect(3)!;
    expect(stage.toScreen({ x: 0, y: box.y + box.height / 2 }).y).toBeCloseTo(350, 0);
    stage.goToPage(3, { behavior: 'instant' }); // back to the setting: top
    const b3 = stage.pageRect(4)!;
    expect(stage.toScreen({ x: 0, y: b3.y }).y).toBeCloseTo(PAD, 0);
  });
});

describe('navigation units: spread when it fits, page when zoomed in', () => {
  // spread (cover): items [0], [1,2], [3,4]
  it('zoomed out (fit-page): next steps by SPREAD — 0 → 1 → 3', () => {
    const { stage } = harness(PORTRAIT, { spread: 'even' });
    stage.fitPage();
    stage.goToPage(0, { behavior: 'instant' });
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(3); // skipped 2: pages 1+2 were one unit
    stage.prev({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
  });

  it('zoomed in: next steps by PAGE — 0 → 1 → 2 → 3, landing top-LEFT of each page', () => {
    const { stage } = harness(PORTRAIT, { spread: 'even' });
    stage.zoomTo({ level: 2 });
    stage.goToPage(0, { behavior: 'instant' });
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
    // landed at PAGE 1's start — not the spread's horizontal center (the old bug)
    const box1 = stage.pageRect(2)!; // pon 2 = page index 1
    expect(stage.toScreen({ x: box1.x, y: box1.y }).x).toBeCloseTo(PAD, 0);
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(2); // walks INTO the spread
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(3);
  });

  it('paged + spread zoomed in: walks pages within the spread, then flips', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged', spread: 'even' });
    stage.goToPage(1, { behavior: 'instant' }); // spread [1,2]
    stage.zoomTo({ level: 2 });
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(2); // same spread, camera moved to page 2
    expect(stage.currentItemPages()).toEqual([1, 2]);
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(3); // flipped to spread [3,4]
    expect(stage.currentItemPages()).toEqual([3, 4]);
  });
});

describe('cursor is THE current page in both flows', () => {
  it('continuous: scrolling syncs the cursor (indicator follows the camera)', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.currentPage()).toBe(0);
    stage.panBy(0, -900); // scroll down ~a page
    expect(stage.currentPage()).toBe(1);
  });

  it('zoomed out, next/prev always progress (never stuck on a visible page)', () => {
    const { stage } = harness(PORTRAIT);
    stage.fitAll(); // everything visible — the old model could never leave page 0
    stage.goToPage(0, { behavior: 'instant' }); // pin the indicator to page 0
    const before = stage.camera();
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1);
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(2);
    // STRUCTURAL no-op (not a visibility condition): under fit-all the canonical
    // placement is the centered scene, and that doesn't change between steps.
    expect(stage.camera()).toEqual(before);
  });
});

describe('fit-all (the construction overview)', () => {
  it('fits and centers the WHOLE scene', () => {
    const { stage } = harness(PORTRAIT, { layout: 'grid', bounded: false });
    stage.fitAll();
    const v = stage.viewport();
    const center = stage.toWorld({ x: v.width / 2, y: v.height / 2 });
    // viewport center = scene center, and every page is on screen
    const all = stage.visiblePages();
    expect(all.length).toBe(5);
    const sceneW = Math.max(...all.map((p) => p.x + p.width));
    const sceneH = Math.max(...all.map((p) => p.y + p.height));
    expect(center.x).toBeCloseTo(sceneW / 2, 0);
    expect(center.y).toBeCloseTo(sceneH / 2, 0);
    expect(sceneW * stage.zoomLevel()).toBeLessThanOrEqual(v.width - 2 * PAD + 1);
    expect(sceneH * stage.zoomLevel()).toBeLessThanOrEqual(v.height - 2 * PAD + 1);
  });
});

describe('cursor is INTENT: a clamped camera never revokes navigation', () => {
  // The reported bug: horizontal, bounded, ~113% — pages near the document edges
  // can't be centered, and the old camera-sync stole the cursor right back.
  const FOUR = Array.from({ length: 4 }, () => ({ width: 600, height: 800 }));
  const config = { layout: 'horizontal' as const, zoom: { level: 1.13 } };

  it('opens on page 1 — not on whatever page the clamped camera centers', () => {
    const { stage } = harness(FOUR, config);
    expect(stage.currentPage()).toBe(0); // intent: the start — even though the
    // viewport center sits over page 2 when the camera is pinned to the left edge
  });

  it('walks 1→2→3→4 and back 4→3→2→1, with the edges clamped', () => {
    const { stage } = harness(FOUR, config);
    const go = (dir: 'next' | 'prev') => stage[dir]({ behavior: 'instant' });

    go('next');
    expect(stage.currentPage()).toBe(1);
    go('next');
    expect(stage.currentPage()).toBe(2);
    go('next');
    expect(stage.currentPage()).toBe(3); // camera clamps at the right edge…
    const rightEdge = stage.camera().x;
    expect(rightEdge).toBeCloseTo(2448 - (1000 - 24) / 1.13, 0); // …but the cursor stays 4

    go('prev');
    expect(stage.currentPage()).toBe(2); // symmetric on the way back
    go('prev');
    expect(stage.currentPage()).toBe(1);
    go('prev');
    expect(stage.currentPage()).toBe(0); // page 1 is reachable again
    expect(stage.camera().x).toBeCloseTo(-24 / 1.13, 0); // clamped at the left edge
  });

  it('manipulation still derives the cursor (pan → indicator follows)', () => {
    const { stage } = harness(FOUR, config);
    expect(stage.currentPage()).toBe(0);
    stage.panBy(-700, 0); // user scrolls right
    expect(stage.currentPage()).toBeGreaterThan(0); // derived from the camera
  });

  it('navigation is CANONICAL: visible-but-off-position targets still settle into place', () => {
    // The 95% symptom: page fits the viewport (fits both axes at 0.8), you're at the
    // right edge, the target is visible but off-position — prev must still settle it
    // at its canonical landing, exactly as it would at 115%. No visibility-dependent
    // behavior (and no zoom-dependent landing: start/start reads the same here).
    const { stage } = harness(FOUR, { layout: 'horizontal', zoom: { level: 0.8 } });
    stage.goToPage(3, { behavior: 'instant' }); // camera clamps at the right edge
    stage.prev({ behavior: 'instant' }); // page 3 (idx 2) is visible but off-position
    expect(stage.currentPage()).toBe(2);
    const box = stage.pageRect(3)!; // pon 3 = page index 2
    // canonical landing: reading edge at the gutter (the scene overflows x, so
    // the arrival policy — not the clamp — decides)
    expect(stage.toScreen({ x: box.x, y: box.y }).x).toBeCloseTo(PAD, 0);
  });

  it('a smooth tween never flickers the cursor off its target', () => {
    const frames: Array<(t: number) => void> = [];
    const scheduler = {
      raf: (cb: (t: number) => void) => {
        frames.push(cb);
        return frames.length;
      },
      caf: () => {},
    };
    const { stage } = harness(FOUR, { ...config, scheduler });
    stage.goToPage(3); // smooth
    expect(stage.currentPage()).toBe(3); // intent holds immediately
    const run = (t: number) => frames.splice(0).forEach((cb) => cb(t));
    run(0);
    run(120);
    expect(stage.currentPage()).toBe(3); // …and mid-tween
    run(240);
    expect(stage.currentPage()).toBe(3); // …and at the end
  });
});

describe('settingsEqual: registry-derived equality (the React selector contract)', () => {
  it('compares by VALUE one level deep — fresh-but-equal objects are equal', () => {
    const a = { ...DEFAULT_SETTINGS };
    // same values in brand-new objects (what a reducer PATCH produces)
    const b = {
      ...DEFAULT_SETTINGS,
      pageFrame: { ...DEFAULT_SETTINGS.pageFrame },
      fitAlign: { ...DEFAULT_SETTINGS.fitAlign },
    };
    expect(settingsEqual(a, b)).toBe(true);
    // a fresh zoom intent with the SAME level is equal (no pinch-tick re-renders)…
    expect(settingsEqual({ ...a, zoom: { level: 1 } }, { ...a, zoom: { level: 1 } })).toBe(true);
    // …and every changed value — primitive, union shape, or nested field — is not
    expect(settingsEqual(a, { ...a, padding: 32 })).toBe(false);
    expect(settingsEqual(a, { ...a, gap: { px: 12 } })).toBe(false);
    expect(settingsEqual(a, { ...a, zoom: { level: 1 } })).toBe(false);
    expect(settingsEqual(a, { ...a, fitAlign: { x: 'center', y: 'start' } })).toBe(false);
  });
});

describe('arrivalAlign: where navigation lands', () => {
  it("{x:'end'}: zoomed-in navigation lands top-RIGHT", () => {
    const { stage } = harness(PORTRAIT, {
      arrivalAlign: { x: 'end', y: 'start' },
      zoom: { level: 2 },
    });
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    // page right edge sits a padding in from the viewport right edge; top a padding down
    expect(stage.toScreen({ x: box.x + box.width, y: box.y }).x).toBeCloseTo(1000 - PAD, 0);
    expect(stage.toScreen({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
  });

  it('Drawboard ({center,center}): zoomed-in navigation centers the page', () => {
    const { stage } = harness(PORTRAIT, {
      arrivalAlign: { x: 'center', y: 'center' },
      zoom: { level: 2 },
      bounded: false, // construction feel — and proves placement needs no real clamp
    });
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    const center = stage.toScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(center.x).toBeCloseTo(500, 0);
    expect(center.y).toBeCloseTo(350, 0);
  });

  it('arrivalAlign is runtime-changeable and only affects the NEXT arrival', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 2 } });
    stage.goToPage(1, { behavior: 'instant' });
    const before = stage.camera();
    stage.setArrivalAlign({ x: 'end', y: 'start' });
    expect(stage.camera()).toEqual(before); // no camera jump on the setting change
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    expect(stage.toScreen({ x: box.x + box.width, y: box.y }).x).toBeCloseTo(1000 - PAD, 0);
  });
});

describe('zoomAlign: what a pointer-less zoom holds fixed', () => {
  it('default center/center: button zoom inflates around the viewport middle', () => {
    const { stage } = harness(PORTRAIT, { bounded: false });
    const before = stage.toWorld({ x: 500, y: 350 });
    stage.zoomIn();
    const after = stage.toWorld({ x: 500, y: 350 });
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it("y:'start': the first visible line holds still (text-editor zoom)", () => {
    const { stage } = harness(PORTRAIT, {
      bounded: false,
      zoomAlign: { x: 'center', y: 'start' },
    });
    // 'start' is the first CONTENT line — just inside the padding gutter, the
    // same spot an arrival puts the page top — not the absolute corner.
    const at = { x: 500, y: PAD };
    const before = stage.toWorld(at);
    stage.zoomIn();
    const after = stage.toWorld(at);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('zoomTo (no pointer) holds the SAME focal point as the buttons', () => {
    const { stage } = harness(PORTRAIT, { bounded: false, zoom: { level: 1 } });
    const before = stage.toWorld({ x: 500, y: 350 });
    stage.zoomTo({ level: 1.7 });
    const after = stage.toWorld({ x: 500, y: 350 });
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  it('pinch/wheel are physics: zoomAround honors ITS point, not the setting', () => {
    const { stage } = harness(PORTRAIT, {
      bounded: false,
      zoomAlign: { x: 'start', y: 'start' }, // a setting that would say otherwise
    });
    const pt = { x: 800, y: 600 };
    const before = stage.toWorld(pt);
    stage.zoomAround(pt, 1.5);
    const after = stage.toWorld(pt);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });
});

describe('anchorAlign: which viewport point survives a reframe', () => {
  it('default start/start — the growing container never shoves the document down (the load bug)', () => {
    const { stage } = harness(PORTRAIT); // automatic zoom resolves to 1
    stage.goToPage(1, { behavior: 'instant' });
    const box = stage.pageRect(2)!;
    expect(stage.toScreen({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
    stage.setViewport({ width: 1000, height: 900 }); // the div finishes laying out
    // the top of the view is pinned; the extra height reveals MORE below
    expect(stage.toScreen({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
  });

  it('center/center — canvas-style symmetric resize (the Figma feel)', () => {
    const { stage } = harness(PORTRAIT, { anchorAlign: { x: 'center', y: 'center' } });
    stage.goToPage(1, { behavior: 'instant' });
    const focus = stage.toWorld({ x: 500, y: 350 }); // what sat at the old center…
    stage.setViewport({ width: 1000, height: 900 });
    const now = stage.toScreen(focus);
    expect(now.x).toBeCloseTo(500, 0); // …sits at the NEW center
    expect(now.y).toBeCloseTo(450, 0);
  });

  it('scene reframes (gap change) hold the anchorAlign point too', () => {
    const { stage } = harness(PORTRAIT, { zoom: { level: 2 } });
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    expect(stage.toScreen({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
    stage.setGap(64); // pages move in world space…
    const after = stage.pageRect(3)!;
    // …but the page-point at the top of the view stays at the top of the view
    expect(stage.toScreen({ x: after.x, y: after.y }).y).toBeCloseTo(PAD, 0);
  });
});

describe('fitAlign: where content RESTS on a fitting axis', () => {
  // the sidebar shape: content narrower & shorter than the viewport
  const FEW = Array.from({ length: 2 }, () => ({ width: 600, height: 800 }));

  it("default {center,center}: a fitting document rests centered (today's feel)", () => {
    const { stage } = harness(FEW, { zoom: { level: 0.25 } });
    const box = stage.pageRect(1)!;
    // content cross extent centered: page 1 center x at viewport center
    expect(stage.toScreen({ x: box.x + box.width / 2, y: 0 }).x).toBeCloseTo(500, 0);
  });

  it("y:'start' — the sidebar fix: few thumbs hug the TOP, padding-exact", () => {
    const { stage } = harness(FEW, {
      zoom: { level: 0.25 },
      fitAlign: { x: 'center', y: 'start' },
    });
    const box = stage.pageRect(1)!;
    expect(stage.toScreen({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 4); // top edge at the gutter
    expect(stage.toScreen({ x: box.x + box.width / 2, y: 0 }).x).toBeCloseTo(500, 0); // x stays centered
  });

  it("logical x: RTL + x:'start' rests at the RIGHT edge", () => {
    const { stage } = harness(FEW, {
      zoom: { level: 0.25 },
      direction: 'rtl',
      fitAlign: { x: 'start', y: 'start' },
    });
    const box = stage.pageRect(1)!;
    expect(stage.toScreen({ x: box.x + box.width, y: 0 }).x).toBeCloseTo(1000 - PAD, 4);
  });

  it('changing fitAlign re-clamps the camera in place (no navigation needed)', () => {
    const { stage } = harness(FEW, { zoom: { level: 0.25 } });
    const centered = stage.camera();
    stage.setFitAlign({ x: 'center', y: 'start' });
    expect(stage.camera().y).not.toBeCloseTo(centered.y, 4); // moved up immediately
    const box = stage.pageRect(1)!;
    expect(stage.toScreen({ x: 0, y: box.y }).y).toBeCloseTo(PAD, 4);
  });

  it('fitAlign never touches an OVERFLOWING axis (free scroll keeps its position)', () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 2 },
      fitAlign: { x: 'center', y: 'start' },
    });
    stage.goToPage(1, { behavior: 'instant' });
    const before = stage.camera();
    stage.panBy(0, -50); // scroll down a bit on the overflowing y axis
    expect(stage.camera().y).toBeGreaterThan(before.y); // pan respected, not snapped back
  });
});

describe('gap: one value between items, every layout', () => {
  it('vertical layout: page 2 starts page-height + gap below page 1', () => {
    const { stage } = harness(PORTRAIT, { gap: 40 });
    expect(stage.pageRect(1)!.y).toBe(0);
    expect(stage.pageRect(2)!.y).toBeCloseTo(800 + 40, 6);
  });

  it('grid layout uses the SAME gap (no hidden 56)', () => {
    const { stage } = harness(PORTRAIT, { layout: 'grid', gap: 40 });
    const a = stage.pageRect(1)!;
    const b = stage.pageRect(2)!; // next column, same row
    expect(b.x - (a.x + a.width)).toBeCloseTo(40, 6);
  });

  it('gap is structural: changing it reflows but keeps the current page', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPage(3, { behavior: 'instant' });
    stage.setGap(64);
    expect(stage.currentPage()).toBe(3);
    expect(stage.pageRect(2)!.y).toBeCloseTo(800 + 64, 6); // scene rebuilt with the new gap
  });
});

describe('direction: rtl — layout flips, navigation does not', () => {
  it('horizontal rtl: page 1 starts at the right; next moves the camera LEFT; cursor walks 0→1→2', () => {
    const { stage } = harness(PORTRAIT, {
      layout: 'horizontal',
      direction: 'rtl',
      zoom: { level: 1.13 },
    });
    expect(stage.currentPage()).toBe(0);
    // page 1 is the RIGHTMOST item in the scene
    const first = stage.pageRect(1)!;
    const last = stage.pageRect(5)!;
    expect(first.x).toBeGreaterThan(last.x);
    const x0 = stage.camera().x;
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(1); // index-based navigation: unchanged
    expect(stage.camera().x).toBeLessThan(x0); // …but the camera moved LEFT
    stage.next({ behavior: 'instant' });
    expect(stage.currentPage()).toBe(2);
  });

  it('vertical rtl + spread: page 1 binds on the right (all flows)', () => {
    const { stage } = harness(PORTRAIT, { spread: 'odd', direction: 'rtl' });
    expect(stage.pageRect(1)!.x).toBeGreaterThan(stage.pageRect(2)!.x);
    // paged too: the slice inherits the swap
    stage.setFlow('paged');
    expect(stage.pageRect(1)!.x).toBeGreaterThan(stage.pageRect(2)!.x);
  });

  it('logical align: the default start/start lands top-RIGHT in rtl (no auto needed)', () => {
    const { stage } = harness(PORTRAIT, { direction: 'rtl', zoom: { level: 2 } });
    stage.goToPage(2, { behavior: 'instant' });
    const box = stage.pageRect(3)!;
    expect(stage.toScreen({ x: box.x + box.width, y: box.y }).x).toBeCloseTo(1000 - PAD, 0);
    expect(stage.toScreen({ x: box.x, y: box.y }).y).toBeCloseTo(PAD, 0);
  });

  it('switching direction keeps the current page (structural, anchor-preserving)', () => {
    const { stage } = harness(PORTRAIT, { layout: 'horizontal' });
    stage.goToPage(3, { behavior: 'instant' });
    stage.setDirection('rtl');
    expect(stage.direction()).toBe('rtl');
    expect(stage.currentPage()).toBe(3);
  });

  it('grid rtl: first page top-right, scene query renders the right pages', () => {
    const { stage } = harness(PORTRAIT, { layout: 'grid', direction: 'rtl' });
    stage.fitAll();
    const all = stage.visiblePages();
    expect(all.length).toBe(5);
    const p1 = all.find((p) => p.pageIndex === 0)!;
    // page 1 occupies the rightmost cell of the top row
    expect(Math.max(...all.map((p) => p.x))).toBeCloseTo(p1.x, 6);
    expect(Math.min(...all.map((p) => p.y))).toBeCloseTo(p1.y, 6);
  });
});

describe("columns: 'auto' — the wrapped grid (thumbnail sidebar)", () => {
  // fixed zoom 0.2, padding 10, gap 12 → cell 612 world; line = (vpW - 20) / 0.2
  const THUMBS = {
    layout: 'grid' as const,
    columns: 'auto' as const,
    zoom: { level: 0.2 },
    padding: 10,
    gap: 12,
  };

  it('narrow viewport → one column; wider → re-wraps to more', () => {
    const { stage } = harness(PORTRAIT, THUMBS, { skipViewport: true });
    stage.setViewport({ width: 160, height: 700 }); // line = 700 world → 1 column
    expect(stage.pageRect(2)!.x).toBeCloseTo(stage.pageRect(1)!.x, 6); // stacked
    expect(stage.pageRect(2)!.y).toBeGreaterThan(stage.pageRect(1)!.y);

    stage.setViewport({ width: 270, height: 700 }); // line = 1250 → 2 columns
    expect(stage.pageRect(2)!.y).toBeCloseTo(stage.pageRect(1)!.y, 6); // side by side
    expect(stage.pageRect(3)!.y).toBeGreaterThan(stage.pageRect(1)!.y); // row 2

    stage.setViewport({ width: 400, height: 700 }); // line = 1900 → 3 columns
    expect(stage.pageRect(3)!.y).toBeCloseTo(stage.pageRect(1)!.y, 6);
  });

  it('re-wrapping keeps the current page (anchor-preserving resize)', () => {
    const { stage } = harness(PORTRAIT, THUMBS, { skipViewport: true });
    stage.setViewport({ width: 160, height: 400 });
    stage.goToPage(4, { behavior: 'instant' });
    stage.setViewport({ width: 400, height: 400 }); // 1 → 3 columns
    expect(stage.currentPage()).toBe(4);
  });
});

describe('wrapped + discrete zoom: the scene re-wraps and the camera follows', () => {
  // vp 1000, padding 24 → line = 952/zoom; cell = 600 + gap 16 = 616 world.
  // zoom 0.35 → line 2720 → 4 columns; ×1.2 → 0.42 → line 2266 → 3 columns.
  const WRAPPED = {
    layout: 'grid' as const,
    columns: 'auto' as const,
    zoom: { level: 0.35 },
    padding: 24,
    gap: 16,
  };

  it('zoomIn across a column boundary leaves the camera ALREADY clamped (the bug)', () => {
    const { stage } = harness(PORTRAIT, WRAPPED);
    // 4 columns: page 4 (idx 3) sits in row 0
    expect(stage.pageRect(4)!.y).toBeCloseTo(stage.pageRect(1)!.y, 6);
    stage.zoomIn();
    // re-wrapped to 3 columns: page 4 moved to row 1
    expect(stage.pageRect(4)!.y).toBeGreaterThan(stage.pageRect(1)!.y);
    // the camera must satisfy the NEW scene's clamp immediately — a no-op pan
    // (which clamps) must not move it. Before the fix, this is where it jumped.
    const settled = stage.camera();
    stage.panBy(0, 0);
    expect(stage.camera()).toEqual(settled);
  });

  it('zoom MODE changes (fit-width/automatic) settle the wrap in one pass (the bug)', () => {
    const { stage } = harness(PORTRAIT, WRAPPED); // level 0.35 → 4 columns
    stage.goToPage(2, { behavior: 'instant' });
    stage.fitWidth(); // resolves to ~1.59 → re-wraps to a single column
    expect(stage.currentPage()).toBe(2); // the reapply never touches the cursor
    expect(stage.pageRect(2)!.y).toBeGreaterThan(stage.pageRect(1)!.y); // 1 column now
    // the camera must already satisfy the NEW scene's clamp — a no-op pan (which
    // clamps) must not move it. Before the fix this is where it jumped on scroll.
    const settled = stage.camera();
    stage.panBy(0, 0);
    expect(stage.camera()).toEqual(settled);
  });

  it('fit-all + wrapped converges too (the circular case, via reapply)', () => {
    const { stage } = harness(PORTRAIT, WRAPPED);
    stage.fitAll(); // zoom depends on scene size, scene size depends on zoom
    const settled = stage.camera();
    stage.panBy(0, 0);
    expect(stage.camera()).toEqual(settled); // legal against the scene it shows
  });

  it('the focal page-point stays under the cursor across the re-wrap (unbounded)', () => {
    // unbounded (the canvas/construction case): no clamp interference, so the
    // re-pin property is exact on both axes. Under bounds, the clamp wins wherever
    // the camera has no freedom — covered by the no-op-pan test above.
    const { stage } = harness(PORTRAIT, { ...WRAPPED, bounded: false });
    const before = stage.pageRect(2)!;
    const screenPt = stage.toScreen({
      x: before.x + before.width * 0.25,
      y: before.y + before.height * 0.4,
    });
    stage.zoomAround(screenPt, 1.2); // crosses the 4→3 column boundary
    const after = stage.pageRect(2)!; // page 2 has MOVED in the new wrap…
    const world = stage.toWorld(screenPt); // …but its page-point is back under the cursor
    expect((world.x - after.x) / after.width).toBeCloseTo(0.25, 3);
    expect((world.y - after.y) / after.height).toBeCloseTo(0.4, 3);
  });

  it('non-wrapped zoomAround is byte-identical (the scene reference never changes)', () => {
    const { stage } = harness(PORTRAIT, { bounded: false }); // unbounded: pure focal, no clamp
    const screenPt = { x: 300, y: 200 };
    const worldBefore = stage.toWorld(screenPt);
    stage.zoomAround(screenPt, 1.7);
    const worldAfter = stage.toWorld(screenPt);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 4); // pure focal zoom, no drift
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 4);
  });
});

describe('the stage is a LENS: multiple instances per document', () => {
  it('stagePlugin({id, token}) registers an independent instance', () => {
    const ThumbsToken = { name: 'stage-thumbs-test' };
    const main = stagePlugin();
    const thumbs = stagePlugin({
      id: 'stage-thumbs',
      token: ThumbsToken as never,
      layout: 'grid',
      columns: 'auto',
      zoom: { level: 0.2 },
    });
    expect(main.id).toBe('stage');
    expect(thumbs.id).toBe('stage-thumbs');
    expect(thumbs.token).toBe(ThumbsToken);
    // each lens gets its own initial settings…
    const mainState = (main.initialState as () => StageState)();
    const thumbState = (thumbs.initialState as () => StageState)();
    expect(mainState.layout).toBe('vertical');
    expect(thumbState.layout).toBe('grid');
    expect(thumbState.columns).toBe('auto');
    // …and id/token do NOT leak into the settings state
    expect('id' in thumbState).toBe(false);
    expect('token' in thumbState).toBe(false);
  });

  it('two lenses over the same document hold independent cameras', () => {
    // two capabilities with separate slices over the SAME document metadata —
    // exactly what the kernel does for two registered stage plugins.
    const { stage: main } = harness(PORTRAIT);
    const { stage: thumbs } = harness(PORTRAIT, {
      layout: 'grid',
      columns: 'auto',
      zoom: { level: 0.2 },
    });
    main.goToPage(4, { behavior: 'instant' });
    expect(main.currentPage()).toBe(4);
    expect(thumbs.currentPage()).toBe(0); // the sidebar lens did not move
    expect(thumbs.zoomLevel()).toBeCloseTo(0.2, 6);
    expect(main.zoomLevel()).not.toBeCloseTo(0.2, 6);
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
    const zoom = stage.zoomLevel();
    expect(stage.pageRect(1)!.width * zoom).toBeCloseTo(200, 4);
    expect(stage.pageRect(2)!.width * zoom).toBeCloseTo(200, 4);
    expect(stage.pageRect(3)!.width * zoom).toBeCloseTo(200, 4);
  });

  it('the same config gives the same pixels for a totally different document', () => {
    const HUGE = [
      { width: 2880, height: 2000 }, // construction sheets
      { width: 2880, height: 2000 },
    ];
    const { stage } = harness(HUGE, { sizing: 'uniform', zoom: { pageWidth: 200 } });
    expect(stage.pageRect(1)!.width * stage.zoomLevel()).toBeCloseTo(200, 4);
  });

  it('intrinsic + pageWidth: the WIDEST page is N px, narrower ones proportional', () => {
    const { stage } = harness(MIXED, { zoom: { pageWidth: 200 } }); // sizing intrinsic
    const zoom = stage.zoomLevel();
    expect(stage.pageRect(2)!.width * zoom).toBeCloseTo(200, 4); // widest = 200
    expect(stage.pageRect(1)!.width * zoom).toBeCloseTo(120, 4); // 600/1000 of it
    expect(stage.pageRect(3)!.width * zoom).toBeCloseTo(100, 4);
  });

  it('paged + pageWidth: the CURRENT page is N px (per-page exact)', () => {
    const { stage } = harness(MIXED, { flow: 'paged', zoom: { pageWidth: 200 } });
    expect(stage.pageRect(1)!.width * stage.zoomLevel()).toBeCloseTo(200, 4);
    stage.goToPage(1, { behavior: 'instant' }); // the 1000-wide page
    expect(stage.pageRect(2)!.width * stage.zoomLevel()).toBeCloseTo(200, 4);
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
    expect(stage.pageRect(1)!.width * stage.zoomLevel()).toBeCloseTo(200, 4);
    const settled = stage.camera();
    stage.panBy(0, 0); // a no-op pan clamps — the camera must already be legal
    expect(stage.camera()).toEqual(settled);
  });
});

describe('gap: the value carries the unit — world (canvas) vs { px } (UI-stable)', () => {
  const screenGap = (stage: ReturnType<typeof harness>['stage']) => {
    const p1 = stage.pageRect(1)!;
    return (stage.pageRect(2)!.y - (p1.y + p1.height)) * stage.zoomLevel();
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

  it('{ px } + pageWidth: the SAME spacing in EVERY document (the sidebar fix)', () => {
    // two documents with wildly different intrinsic sizes → different lens zooms
    const ebook = harness(PORTRAIT, { zoom: { pageWidth: 110 }, gap: { px: 12 } }).stage;
    const sheets = harness(
      Array.from({ length: 3 }, () => ({ width: 2880, height: 2000 })),
      { zoom: { pageWidth: 110 }, gap: { px: 12 } },
    ).stage;
    expect(ebook.zoomLevel()).not.toBeCloseTo(sheets.zoomLevel(), 4); // proves the zooms differ
    expect(screenGap(ebook)).toBeCloseTo(12, 3);
    expect(screenGap(sheets)).toBeCloseTo(12, 3);
  });

  it('{ px } under a fit mode converges (no-op pan invariant)', () => {
    const { stage } = harness(PORTRAIT, { zoom: { mode: 'fit-width' }, gap: { px: 12 } });
    const settled = stage.camera();
    stage.panBy(0, 0);
    expect(stage.camera()).toEqual(settled);
    expect(screenGap(stage)).toBeCloseTo(12, 3);
  });
});

describe('pageFrame (screen px): reserved chrome bands at the lens zoom', () => {
  it('px-exact bands at a fixed zoom level', () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 0.5 },
      pageFrame: { top: 10, right: 0, bottom: 30, left: 0 },
    });
    const p1 = stage.pageRect(1)!;
    const p2 = stage.pageRect(2)!;
    // world distance between pages = bottom/zoom + gap + top/zoom
    expect(p2.y - (p1.y + p1.height)).toBeCloseTo(30 / 0.5 + 16 + 10 / 0.5, 4);
    // on screen that is exactly 30px + scaled gap + 10px — the bands are px-true
    expect((p2.y - (p1.y + p1.height)) * stage.zoomLevel()).toBeCloseTo(30 + 16 * 0.5 + 10, 4);
  });

  it('fit-page treats the OUTER box as the unit (chrome stays in view)', () => {
    const bare = harness(PORTRAIT, { zoom: { mode: 'fit-page' } }).stage.zoomLevel();
    const chromed = harness(PORTRAIT, {
      zoom: { mode: 'fit-page' },
      pageFrame: { top: 0, right: 0, bottom: 40, left: 0 },
    }).stage.zoomLevel();
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
    stage.setViewport({ width: 140, height: 700 }); // narrow sidebar → 1 column
    const settled = stage.camera();
    stage.panBy(0, 0); // a no-op pan clamps — the camera must already be legal
    expect(stage.camera()).toEqual(settled);
    // single column: page 2 is BELOW page 1, separated by the 16 SCREEN px label
    // band plus the world gap
    const zoom = stage.zoomLevel();
    expect(110 / zoom).toBeCloseTo(600, 0); // pageWidth target hit (110px wide thumbs)
    const p1 = stage.pageRect(1)!;
    const below = stage.pageRect(2)!.y - (p1.y + p1.height);
    expect(below * zoom).toBeCloseTo(16 + 12 * zoom, 1); // band(px) + gap(world→px)
  });

  it('reveal includes the chrome band (the label scrolls into view too)', () => {
    const { stage } = harness(PORTRAIT, {
      zoom: { level: 0.5 },
      pageFrame: { top: 0, right: 0, bottom: 30, left: 0 },
    });
    stage.reveal(3, { behavior: 'instant' });
    const rect = stage.pageRect(4)!; // pon 4 = page index 3
    const outerBottom = rect.y + rect.height + 30 / 0.5; // page + its band
    // coming from above, reveal pins the OUTER bottom at the padded view edge
    expect(outerBottom).toBeCloseTo(stage.camera().y + (700 - PAD) / 0.5, 4);
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
    const start = stage.camera();
    stage.reveal(4, { behavior: 'instant' }); // far below the 700px window
    const revealed = stage.camera();
    expect(revealed).not.toEqual(start);
    // minimal: page 5's BOTTOM edge sits a padding above the viewport bottom
    const box = stage.pageRect(5)!;
    expect(stage.toScreen({ x: box.x, y: box.y + box.height }).y).toBeCloseTo(700 - 10, 0);
    // revealing it again — or a neighbour that's now visible — moves nothing
    stage.reveal(4, { behavior: 'instant' });
    expect(stage.camera()).toEqual(revealed);
    stage.reveal(3, { behavior: 'instant' });
    expect(stage.camera()).toEqual(revealed);
  });

  it('reveal is NOT navigation: the cursor never moves', () => {
    const { stage } = harness(PORTRAIT, THUMBS);
    expect(stage.currentPage()).toBe(0);
    stage.reveal(4, { behavior: 'instant' });
    expect(stage.currentPage()).toBe(0); // intent untouched — only the camera moved
  });

  it('paged flow: revealing an off-scene page delegates to navigation', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.reveal(3, { behavior: 'instant' });
    expect(stage.currentPage()).toBe(3); // the page can only be seen by going there
    expect(stage.visiblePages().map((p) => p.pageIndex)).toEqual([3]);
  });
});

describe('viewpoint: per-page view memory (construction worksheets)', () => {
  it('goToPage with a saved viewpoint restores the exact camera', () => {
    const { stage } = harness(PORTRAIT, { flow: 'paged' });
    stage.goToPage(2, { behavior: 'instant' });
    stage.zoomAround({ x: 700, y: 500 }, 3); // zoom into "the bathroom"
    stage.panBy(-40, -60);
    const saved = stage.viewpoint();
    const cameraBefore = stage.camera();

    stage.goToPage(0, { behavior: 'instant' }); // go work on another floor
    expect(stage.currentPage()).toBe(0);

    stage.goToPage(2, { behavior: 'instant', viewpoint: saved }); // come back
    expect(stage.currentPage()).toBe(2);
    expect(stage.camera().zoom).toBeCloseTo(cameraBefore.zoom, 4);
    expect(stage.camera().x).toBeCloseTo(cameraBefore.x, 2);
    expect(stage.camera().y).toBeCloseTo(cameraBefore.y, 2);
  });
});

describe('viewRotation: the NON-persistent view rotation (Adobe "Rotate View")', () => {
  it('rotates every page footprint and never touches the document', () => {
    const { stage, meta } = harness(PORTRAIT);
    stage.setViewRotation(90);
    const box = stage.pageRect(1)!;
    // 600×800 portrait DISPLAYS landscape…
    expect(box.rotation).toBe(90);
    expect(box.width).toBeCloseTo(800, 0);
    expect(box.height).toBeCloseTo(600, 0);
    expect(box.transform.rotation).toBe(90);
    // …while the document stays exactly as it was: no /Rotate write, no revision
    // bump — this is a display setting of the lens, not an edit.
    expect(meta.pages[0].rotation).toBe(0);
    expect(meta.revision).toBe(0);
    expect(stage.viewRotation()).toBe(90);
    expect(stage.settings().viewRotation).toBe(90); // in the settings snapshot (presets/persist)
  });

  it("composes with a page's own /Rotate (the TOTAL display rotation, mod 360)", () => {
    const { stage } = harness([
      { width: 600, height: 800, rotation: 90 },
      { width: 600, height: 800 },
    ]);
    stage.setViewRotation(90);
    // page 1: 90 (/Rotate) + 90 (view) = 180 → footprint back to portrait
    const first = stage.pageRect(1)!;
    expect(first.rotation).toBe(180);
    expect(first.width).toBeCloseTo(600, 0);
    // page 2: 0 + 90 → landscape
    const second = stage.pageRect(2)!;
    expect(second.rotation).toBe(90);
    expect(second.width).toBeCloseTo(800, 0);
  });

  it('rotateView steps a quarter-turn relative and wraps in both directions', () => {
    const { stage } = harness(PORTRAIT);
    stage.rotateView(90);
    expect(stage.viewRotation()).toBe(90);
    stage.rotateView(90);
    stage.rotateView(90);
    stage.rotateView(90);
    expect(stage.viewRotation()).toBe(0); // full circle
    stage.rotateView(-90);
    expect(stage.viewRotation()).toBe(270); // wraps below zero
  });

  it('is an anchor-preserving reframe: the page you were on survives the turn', () => {
    const { stage } = harness(PORTRAIT);
    stage.goToPage(3, { behavior: 'instant' });
    stage.rotateView(90);
    expect(stage.currentPage()).toBe(3);
    // and fit-width now resolves against the SWAPPED footprint (800, not 600)
    stage.fitWidth();
    expect(stage.zoomLevel()).toBeCloseTo((1000 - 2 * PAD) / 800, 3);
  });

  it('hit-testing round-trips under rotation, and pageAt reports the display rotation', () => {
    const { stage } = harness(PORTRAIT);
    stage.setViewRotation(90);
    const content = { x: 150, y: 400 }; // a content point on page 1 (un-rotated frame)
    const world = stage.pageToWorld(1, content)!;
    const hit = stage.pageAt(stage.toScreen(world))!;
    expect(hit.pon).toBe(1);
    expect(hit.rotation).toBe(90); // the total display rotation rides the sample
    expect(hit.point.x).toBeCloseTo(content.x, 1);
    expect(hit.point.y).toBeCloseTo(content.y, 1);
  });
});

describe("VisiblePage.visibleRect — visibility is the stage's data", () => {
  it('initial view (zoom 1, 1000×700 viewport): full width, 676pt of height', () => {
    const { stage } = harness(PORTRAIT);
    const p = stage.visiblePages()[0]!;
    // Page top sits a padding (24) below the viewport top at zoom 1 → the
    // visible page window is the full 600pt width × (700−24)pt of height.
    expect(p.visibleRect.x).toBeCloseTo(0, 0);
    expect(p.visibleRect.y).toBeCloseTo(0, 0);
    expect(p.visibleRect.width).toBeCloseTo(600, 0);
    expect(p.visibleRect.height).toBeCloseTo(676, 0);
  });

  it('zoomed in: a proper sub-rect that tracks the pan', () => {
    const { stage } = harness(PORTRAIT);
    stage.zoomTo({ level: 4 });
    const before = stage.visiblePages()[0]!.visibleRect;
    // Deep zoom: far less than the page is visible (1000/4 = 250pt window).
    expect(before.width).toBeLessThan(600);
    expect(before.width).toBeGreaterThan(0);
    expect(before.height).toBeLessThan(800);
    // panBy is grab-and-drag: dragging content RIGHT slides the visible
    // window LEFT in page space. Half a window's worth of drag.
    stage.panBy(before.width * stage.camera().zoom * 0.5, 0);
    const after = stage.visiblePages()[0]!.visibleRect;
    expect(after.x).toBeLessThan(before.x);
    expect(after.width).toBeCloseTo(before.width, 0);
  });

  it('rotated page: the sub-rect is expressed in UN-rotated page points', () => {
    const { stage } = harness([{ width: 600, height: 800, rotation: 90 }]);
    const p = stage.visiblePages()[0]!;
    // Whole page visible at fit — the rect is the page's own point space,
    // not the rotated footprint's.
    expect(p.visibleRect.width).toBeCloseTo(600, 0);
    expect(p.visibleRect.height).toBeCloseTo(800, 0);
  });
});

// ── touch physics: gesture transaction, fling, double-tap ────────────────────
// A manual scheduler makes the fling/tween loops fully deterministic: `step(ts)`
// fires every currently-queued frame callback with that timestamp.
function manualScheduler() {
  const queue = new Map<number, (t: number) => void>();
  let handle = 0;
  return {
    scheduler: {
      raf: (cb: (t: number) => void) => {
        queue.set(++handle, cb);
        return handle;
      },
      caf: (h: number) => {
        queue.delete(h);
      },
    },
    step(ts: number) {
      const cbs = [...queue.values()];
      queue.clear();
      cbs.forEach((cb) => cb(ts));
    },
    pending: () => queue.size,
  };
}

describe('gesture transaction (beginGesture/endGesture)', () => {
  it('defers the pinch zoom intent to endGesture — one PATCH per gesture', () => {
    const { stage } = harness(PORTRAIT);
    expect(stage.zoomMode()).toBe('automatic');
    stage.beginGesture();
    stage.zoomAround({ x: 500, y: 350 }, 1.5);
    stage.zoomAround({ x: 500, y: 350 }, 1.1);
    // camera zoom moved live, but the INTENT is still the fit mode
    expect(stage.zoomLevel()).toBeCloseTo(stage.camera().zoom, 6);
    expect(stage.zoomMode()).toBe('automatic');
    stage.endGesture();
    // now the gesture's landing is recorded, once
    expect(stage.zoomMode()).toBe('custom');
  });

  it('nests: only the OUTERMOST end commits', () => {
    const { stage } = harness(PORTRAIT);
    stage.beginGesture();
    stage.beginGesture();
    stage.zoomAround({ x: 500, y: 350 }, 2);
    stage.endGesture();
    expect(stage.zoomMode()).toBe('automatic'); // still open
    stage.endGesture();
    expect(stage.zoomMode()).toBe('custom');
  });

  it('a pan-only gesture commits no zoom intent', () => {
    const { stage } = harness(PORTRAIT);
    stage.beginGesture();
    stage.panBy(0, -200);
    stage.endGesture();
    expect(stage.zoomMode()).toBe('automatic');
  });
});

describe('fling (momentum pan)', () => {
  it('decelerates on the UIScrollView curve and comes to rest', () => {
    const sched = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: sched.scheduler });
    const y0 = stage.camera().y;
    stage.fling(0, -1000); // a 1000 px/s upward flick (content scrolls down)
    const deltas: number[] = [];
    let prev = y0;
    let ts = 0;
    for (let i = 0; i < 1000 && sched.pending() > 0; i++) {
      sched.step(ts);
      ts += 16;
      const y = stage.camera().y;
      if (y !== prev) deltas.push(y - prev);
      prev = y;
    }
    expect(sched.pending()).toBe(0); // it STOPPED on its own
    // it moved a long way (v0/λ ≈ 500 px at zoom 1), decelerating monotonically
    const total = stage.camera().y - y0;
    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(600);
    for (let i = 2; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1] + 1e-9);
    }
  });

  it('is caught by the next gesture (beginGesture cancels it)', () => {
    const sched = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: sched.scheduler });
    stage.fling(0, -1000);
    sched.step(0);
    sched.step(16);
    expect(stage.cameraInMotion()).toBe(true);
    stage.beginGesture(); // the finger lands
    expect(stage.cameraInMotion()).toBe(false);
    expect(sched.pending()).toBe(0);
    stage.endGesture();
  });

  it('dies quickly against a content edge instead of grinding on the clamp', () => {
    const sched = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: sched.scheduler });
    const y0 = stage.camera().y; // resting at the top already
    stage.fling(0, 5000); // flick DOWNWARD: content wants to move down — no room
    let ts = 0;
    let frames = 0;
    while (sched.pending() > 0 && frames < 100) {
      sched.step(ts);
      ts += 16;
      frames++;
    }
    expect(frames).toBeLessThan(10); // both axes zeroed by the clamp almost at once
    expect(stage.camera().y).toBeCloseTo(y0, 4);
  });

  it('below the stop threshold nothing starts', () => {
    const sched = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: sched.scheduler });
    stage.fling(0, -10); // 10 px/s: imperceptible
    expect(sched.pending()).toBe(0);
  });
});

describe('doubleTapZoom', () => {
  it('toggles: in to 2.5× the automatic fit, back out at the same point', () => {
    const sched = manualScheduler();
    const { stage } = harness(PORTRAIT, { scheduler: sched.scheduler });
    const base = stage.zoomLevel(); // automatic fit (1: capped at 100%)
    stage.doubleTapZoom({ x: 500, y: 350 });
    let ts = 0;
    while (sched.pending() > 0 && ts < 5000) {
      sched.step(ts);
      ts += 16;
    }
    expect(stage.zoomLevel()).toBeCloseTo(base * 2.5, 3);
    expect(stage.zoomMode()).toBe('custom');
    stage.doubleTapZoom({ x: 500, y: 350 });
    while (sched.pending() > 0 && ts < 10000) {
      sched.step(ts);
      ts += 16;
    }
    expect(stage.zoomLevel()).toBeCloseTo(base, 3);
  });
});
