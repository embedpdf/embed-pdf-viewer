import { afterEach, describe, expect, it, vi } from 'vitest';

import { clientPageProjector, stageViewProjector } from '../src/page-projector';

const page = {
  ref: { kind: 'objectNumber' as const, objectNumber: 4 },
  transform: { viewScale: 2, rotation: 90 as const, zoom: 1.5 },
  toClientRect: (rect: { x: number; y: number; width: number; height: number }) => ({
    ...rect,
    x: rect.x + 100,
  }),
  toClientPoint: (point: { x: number; y: number }) => ({ x: point.x + 100, y: point.y }),
};
const other = { kind: 'objectNumber' as const, objectNumber: 5 };
const rect = { x: 1, y: 2, width: 3, height: 4 };

afterEach(() => vi.unstubAllGlobals());

describe('clientPageProjector', () => {
  it('projects its own page once mounted, and nothing else', () => {
    let mounted = false;
    const projector = clientPageProjector(page, () => mounted);
    expect(projector.space).toBe('client');
    expect(projector.toScreen(page.ref, rect)).toBeNull();
    mounted = true;
    expect(projector.toScreen(page.ref, rect)).toEqual({ ...rect, x: 101 });
    expect(projector.toScreenPoint(page.ref, { x: 1, y: 1 })).toEqual({ x: 101, y: 1 });
    expect(projector.toScreen(other, rect)).toBeNull();
    expect(projector.viewEnv(page.ref)).toEqual({ scale: 2, rotation: 90, zoom: 1.5 });
    expect(projector.viewEnv(other)).toBeNull();
  });

  it('keeps anchored UI inside the window', () => {
    vi.stubGlobal('document', { documentElement: { clientWidth: 800, clientHeight: 600 } });
    expect(clientPageProjector(page, () => true).view()).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });
});

describe('clientPageProjector with a transform signal', () => {
  it('reads the transform when it projects', () => {
    let transform: { viewScale: number; rotation: 0 | 90 | 180 | 270; zoom: number } = {
      viewScale: 2,
      rotation: 90,
      zoom: 1.5,
    };
    const projector = clientPageProjector({ ...page, transform: () => transform }, () => true);
    expect(projector.viewEnv(page.ref)).toEqual({ scale: 2, rotation: 90, zoom: 1.5 });
    transform = { viewScale: 4, rotation: 0, zoom: 3 };
    expect(projector.viewEnv(page.ref)).toEqual({ scale: 4, rotation: 0, zoom: 3 });
  });
});

describe('stageViewProjector', () => {
  const stage = {
    pageRectToViewport: (target: { objectNumber: number }, box: typeof rect) =>
      target.objectNumber === 4 ? { ...box, x: box.x + 10, y: box.y + 20 } : null,
    getPageFrame: (target: { objectNumber: number }) =>
      target.objectNumber === 4
        ? { transform: { viewScale: 2, rotation: 180 as const, zoom: 1.5 } }
        : null,
    getViewportSize: () => ({ width: 800, height: 600 }),
  };

  it("projects through the Stage's camera, in its own box", () => {
    const projector = stageViewProjector(() => stage);
    expect(projector.space).toBe('overlay');
    expect(projector.toScreen(page.ref, rect)).toEqual({ ...rect, x: 11, y: 22 });
    expect(projector.toScreenPoint(page.ref, { x: 1, y: 2 })).toEqual({ x: 11, y: 22 });
    expect(projector.toScreen(other, rect)).toBeNull();
    expect(projector.viewEnv(page.ref)).toEqual({ scale: 2, rotation: 180, zoom: 1.5 });
    expect(projector.viewEnv(other)).toBeNull();
    expect(projector.view()).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('projects nothing without a Stage, or before it has a size', () => {
    expect(stageViewProjector(() => null).toScreen(page.ref, rect)).toBeNull();
    expect(stageViewProjector(() => null).view()).toBeNull();
    const unsized = { ...stage, getViewportSize: () => ({ width: 0, height: 0 }) };
    expect(stageViewProjector(() => unsized).view()).toBeNull();
  });
});
