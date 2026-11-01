import { describe, expect, it } from 'vitest';
import { toPageRef, type PageRef } from '@embedpdf/core';
import { manualClock } from '@embedpdf/core/testing';
import { ZOOM_MAX, type Point } from '@embedpdf/core-stage';

import type { StageHostCapability } from '../src/host-contract';
import { placedStage } from './harness';

const PAD = 24; // default StageSettings.padding: the fit inset
const VIEWPORT = { width: 1000, height: 700 };
const CENTER = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

/** A placed stage whose reveals land at once, so a test reads the camera right after. */
const instantStage = () => placedStage(5, { scrollBehavior: 'instant' });

/** What the user sees at a viewport point: the page drawn there and the point on it. */
const seenAt = (stage: StageHostCapability, point: Point): { page: PageRef; point: Point } => {
  const hit = stage.getPageAt(point)!;
  return { page: hit.ref, point: hit.point };
};
/** Where a page point is drawn now, in viewport px. */
const drawnAt = (stage: StageHostCapability, seen: { page: PageRef; point: Point }): Point => {
  const frame = stage.getPageFrame(seen.page)!;
  const view = frame.transform.pageToView(seen.point);
  return { x: frame.screenX + view.x, y: frame.screenY + view.y };
};

describe('the zoom tool: a box', () => {
  it('zooms so the box fills the view, its middle in the middle', () => {
    const { stage } = instantStage();
    const before = stage.getZoomLevel();
    const middle = seenAt(stage, { x: 400, y: 275 });

    stage.beginZoomDrag({ x: 300, y: 200 });
    stage.moveZoomDrag({ x: 500, y: 350 });
    stage.endZoomDrag();

    // 200 × 150 px: the height limits the fit, inside the padding.
    expect(stage.getZoomLevel()).toBeCloseTo(
      before * Math.min((VIEWPORT.width - 2 * PAD) / 200, (VIEWPORT.height - 2 * PAD) / 150),
      6,
    );
    // Within half a pixel: pages are drawn on whole device pixels.
    const landed = drawnAt(stage, middle);
    expect(Math.abs(landed.x - CENTER.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(landed.y - CENTER.y)).toBeLessThanOrEqual(0.5);
    expect(stage.getZoomBox()).toBeNull();
  });

  it('zooms straight in: the box grows about one point, its middle on a straight line to the middle', () => {
    const time = manualClock();
    const { stage } = placedStage(5, {}, time.clock); // smooth, on frames the test steps
    stage.zoomTo(1.5); // the page is wider than the view, so both axes can travel
    const start = { x: 300, y: 200 };
    const end = { x: 500, y: 350 };
    const startMiddle = { x: 400, y: 275 };
    const middle = seenAt(stage, startMiddle);
    const corner = seenAt(stage, start);
    stage.beginZoomDrag(start);
    stage.moveZoomDrag(end);
    stage.endZoomDrag();

    const path: Point[] = [];
    const corners: Point[] = [];
    for (let now = 0; now <= 240; now += 20) {
      time.frame(now);
      path.push(drawnAt(stage, middle));
      corners.push(drawnAt(stage, corner));
    }
    const last = path[path.length - 1];
    expect(Math.abs(last.x - CENTER.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(last.y - CENTER.y)).toBeLessThanOrEqual(0.5);
    // Every frame lies on the segment from where the middle was to the view's middle,
    // a little further along each time: no swing away and back.
    const direction = { x: CENTER.x - startMiddle.x, y: CENTER.y - startMiddle.y };
    const length = Math.hypot(direction.x, direction.y);
    let along = 0;
    for (const at of path) {
      const offset = { x: at.x - startMiddle.x, y: at.y - startMiddle.y };
      const across = (offset.x * direction.y - offset.y * direction.x) / length;
      const next = (offset.x * direction.x + offset.y * direction.y) / length;
      expect(Math.abs(across)).toBeLessThanOrEqual(1);
      expect(next).toBeGreaterThanOrEqual(along - 0.5);
      expect(next).toBeLessThanOrEqual(length + 0.5);
      along = next;
    }
    // The box's corner moves away from its middle the whole way: the box only grows.
    const spans = corners.map((at, index) =>
      Math.hypot(at.x - path[index].x, at.y - path[index].y),
    );
    spans.reduce((previous, span) => {
      expect(span).toBeGreaterThanOrEqual(previous - 0.5);
      return span;
    });
  });

  it('can start between pages and reach onto the next page', () => {
    const { stage } = instantStage();
    stage.fitPage();
    const frame = stage.getPageFrame(toPageRef(2))!;
    const { x: left, y: secondTop } = stage.worldToViewport({ x: frame.x, y: frame.y });
    const start = { x: left + 100, y: secondTop - 6 };
    expect(stage.getPageAt(start)).toBeNull(); // the space between pages 1 and 2
    const end = { x: left + 300, y: secondTop + 100 };
    const middle = seenAt(stage, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });

    stage.beginZoomDrag(start);
    stage.moveZoomDrag(end);
    stage.endZoomDrag();

    const landed = drawnAt(stage, middle);
    expect(Math.abs(landed.x - CENTER.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(landed.y - CENTER.y)).toBeLessThanOrEqual(0.5);
    // The box's middle is on the second page, so that page is the current one.
    expect(stage.getCurrentPageIndex()).toBe(1);
  });

  it('is kept inside the document near its edge, as every arrival is', () => {
    const { stage } = instantStage();
    stage.beginZoomDrag({ x: 120, y: 30 }); // left of the first page, at the top
    stage.moveZoomDrag({ x: 260, y: 130 });
    stage.endZoomDrag();
    const corner = stage.worldToViewport({ x: 0, y: 0 });
    expect(corner.x).toBeLessThanOrEqual(PAD + 1e-6);
    expect(corner.y).toBeLessThanOrEqual(PAD + 1e-6);
  });

  it('stops at the zoom limit for a box a few pixels across', () => {
    const { stage } = instantStage();
    stage.zoomTo(10);
    stage.beginZoomDrag({ x: 500, y: 300 });
    stage.moveZoomDrag({ x: 505, y: 304 });
    stage.endZoomDrag();
    expect(stage.getZoomLevel()).toBe(ZOOM_MAX);
  });

  it('is drawn once it is a box, in viewport px, the same object until it moves', () => {
    const { stage } = instantStage();
    expect(stage.getZoomBox()).toBeNull();
    stage.beginZoomDrag({ x: 400, y: 300 });
    expect(stage.getZoomBox()).toBeNull(); // still a click
    stage.moveZoomDrag({ x: 402, y: 303 });
    expect(stage.getZoomBox()).toBeNull();

    stage.moveZoomDrag({ x: 350, y: 380 });
    const box = stage.getZoomBox()!;
    expect(box.x).toBeCloseTo(350, 6);
    expect(box.y).toBeCloseTo(300, 6);
    expect(box.width).toBeCloseTo(50, 6);
    expect(box.height).toBeCloseTo(80, 6);
    expect(stage.getZoomBox()).toBe(box);
  });

  it('stays on the content when the view scrolls during the drag', () => {
    const { stage } = instantStage();
    stage.beginZoomDrag({ x: 400, y: 300 });
    stage.moveZoomDrag({ x: 500, y: 400 });
    stage.scrollBy({ top: 50 });
    const box = stage.getZoomBox()!;
    expect(box.y).toBeCloseTo(250, 6);
    expect(box.height).toBeCloseTo(100, 6);
  });

  it('is dropped by a cancel, and nothing zooms', () => {
    const { stage } = instantStage();
    const camera = stage.getCamera();
    stage.beginZoomDrag({ x: 300, y: 200 });
    stage.moveZoomDrag({ x: 500, y: 350 });
    stage.cancelZoomDrag();
    expect(stage.getZoomBox()).toBeNull();
    stage.endZoomDrag();
    expect(stage.getCamera()).toEqual(camera);
  });
});

describe('the zoom tool: a click', () => {
  it('zooms in one step, holding the clicked point', () => {
    const { stage } = instantStage();
    stage.zoomTo(2); // wider than the view, so both axes can hold the point
    const before = stage.getZoomLevel();
    const point = { x: 380, y: 260 };
    const under = seenAt(stage, point);

    stage.beginZoomDrag(point);
    stage.moveZoomDrag({ x: 382, y: 261 }); // a hand's wobble is still a click
    stage.endZoomDrag();

    expect(stage.getZoomLevel()).toBeGreaterThan(before);
    const held = drawnAt(stage, under);
    expect(Math.abs(held.x - point.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(held.y - point.y)).toBeLessThanOrEqual(0.5);
  });

  it('zooms out one step with zoomOut', () => {
    const { stage } = instantStage();
    stage.zoomTo(2);
    stage.beginZoomDrag({ x: 380, y: 260 });
    stage.endZoomDrag({ zoomOut: true });
    expect(stage.getZoomLevel()).toBeLessThan(2);
  });
});

describe('zoomIn and zoomOut around a point', () => {
  it('hold the point they are given', () => {
    const { stage } = instantStage();
    stage.zoomTo(2);
    const point = { x: 700, y: 150 };
    const under = stage.viewportToWorld(point);
    stage.zoomIn({ around: point });
    const held = stage.worldToViewport(under);
    expect(held.x).toBeCloseTo(point.x, 4);
    expect(held.y).toBeCloseTo(point.y, 4);
    stage.zoomOut({ around: point });
    expect(stage.worldToViewport(under).x).toBeCloseTo(point.x, 4);
  });
});

describe('reveal with a fit', () => {
  it('stops at the zoom limit for a rect too small to fill the view', () => {
    const { stage } = instantStage();
    stage.reveal(0, { rect: { x: 100, y: 100, width: 2, height: 2 }, zoom: 'fit' });
    expect(stage.getZoomLevel()).toBe(ZOOM_MAX);
  });
});

describe('the zoomBox setting', () => {
  it('follows the accent until a color is set, and a patch sets only the colors it names', () => {
    const { stage } = instantStage();
    expect(stage.getSettings().zoomBox).toEqual({ fill: null, stroke: null });
    stage.updateSettings({ zoomBox: { stroke: '#e91e63' } });
    expect(stage.getSettings().zoomBox).toEqual({ fill: null, stroke: '#e91e63' });
  });
});
