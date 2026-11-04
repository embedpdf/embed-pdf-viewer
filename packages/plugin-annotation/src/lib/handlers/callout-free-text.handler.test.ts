import type { HandlerContext } from './types';
import type { AnnotationTool } from '../tools/types';
import { defaultTools } from '../tools/default-tools';
import * as patching from '../patching';
import type { PdfFreeTextAnnoObject, Position, Rotation } from '@embedpdf/models';
import { describe, expect, it, vi } from 'vitest';

function setup(turn: Rotation) {
  const tool = defaultTools.find(
    (item) => item.id === 'freeTextCallout',
  )! as AnnotationTool<PdfFreeTextAnnoObject>;
  const commit = vi.fn(),
    preview = vi.fn();
  const handlers = tool.pointerHandler!.create({
    pageIndex: 0,
    pageSize: { width: 600, height: 800 },
    pageRotation: turn,
    scale: 1,
    getTool: () => tool,
    getToolContext: () => undefined,
    services: { requestFile: vi.fn() },
    onCommit: commit,
    onPreview: preview,
  } as HandlerContext<PdfFreeTextAnnoObject>);
  const toPage = ({ x, y }: Position): Position =>
    turn === 1
      ? { x: y, y: 800 - x }
      : turn === 2
        ? { x: 600 - x, y: 800 - y }
        : turn === 3
          ? { x: 600 - y, y: x }
          : { x, y };
  const event = {} as Parameters<NonNullable<typeof handlers.onPointerDown>>[1];
  const click = (point: Position) => {
    handlers.onPointerDown!(toPage(point), event, 'freeTextCallout');
    handlers.onPointerUp!(toPage(point), event, 'freeTextCallout');
  };
  return { tool, handlers, commit, preview, toPage, click, event };
}

describe('native callout orientation', () => {
  for (const turn of [0, 1, 2, 3] as Rotation[]) {
    it(`keeps the clicked box upright and arrow at its visual location for rotation ${turn * 90}`, () => {
      const { click, commit, toPage } = setup(turn);
      click({ x: 100, y: 100 });
      click({ x: 160, y: 120 });
      click({ x: 250, y: 140 });
      const value = commit.mock.calls[0][0] as PdfFreeTextAnnoObject;
      expect(((value.rotation ?? 0) + turn * 90) % 360).toBe(0);
      const local = value.unrotatedRect ?? value.rect;
      const box = patching.computeTextBoxFromRD(local, value.rectangleDifferences);
      expect(box.size.width).toBeCloseTo(150);
      expect(box.size.height).toBeCloseTo(40);
      const handles = patching.calloutVertexConfig.extractVertices(value);
      expect(handles[2].x).toBeCloseTo(box.origin.x);
      expect(handles[2].y).toBeCloseTo(box.origin.y);
      expect(handles[3].x - handles[2].x).toBeCloseTo(150);
      expect(handles[3].y - handles[2].y).toBeCloseTo(40);
      const pivot = {
        x: value.rect.origin.x + value.rect.size.width / 2,
        y: value.rect.origin.y + value.rect.size.height / 2,
      };
      const arrow = value.calloutLine![0],
        dx = arrow.x - pivot.x,
        dy = arrow.y - pivot.y;
      const actual =
        turn === 1
          ? { x: pivot.x + dy, y: pivot.y - dx }
          : turn === 2
            ? { x: pivot.x - dx, y: pivot.y - dy }
            : turn === 3
              ? { x: pivot.x - dy, y: pivot.y + dx }
              : arrow;
      expect(actual.x).toBeCloseTo(toPage({ x: 100, y: 100 }).x);
      expect(actual.y).toBeCloseTo(toPage({ x: 100, y: 100 }).y);
    });

    it(`keeps a dragged box and its preview aligned for rotation ${turn * 90}`, () => {
      const { click, handlers, toPage, event, preview, commit } = setup(turn);
      click({ x: 100, y: 100 });
      click({ x: 160, y: 120 });
      handlers.onPointerDown!(toPage({ x: 200, y: 130 }), event, 'freeTextCallout');
      handlers.onPointerMove!(toPage({ x: 380, y: 190 }), event, 'freeTextCallout');
      const box = preview.mock.calls.at(-1)![0].data.textBox;
      expect(box.size).toEqual(turn % 2 ? { width: 60, height: 180 } : { width: 180, height: 60 });
      handlers.onPointerUp!(toPage({ x: 380, y: 190 }), event, 'freeTextCallout');
      const value = commit.mock.calls[0][0] as PdfFreeTextAnnoObject;
      const size = patching.computeTextBoxFromRD(
        value.unrotatedRect ?? value.rect,
        value.rectangleDifferences,
      ).size;
      expect(size.width).toBeCloseTo(180);
      expect(size.height).toBeCloseTo(60);
    });

    it(`preserves the box while editing style and vertices for rotation ${turn * 90}`, () => {
      const { click, commit, tool } = setup(turn);
      click({ x: 100, y: 100 });
      click({ x: 160, y: 120 });
      click({ x: 250, y: 140 });
      let value = commit.mock.calls[0][0] as PdfFreeTextAnnoObject;
      const before = patching.computeTextBoxFromRD(
        value.unrotatedRect ?? value.rect,
        value.rectangleDifferences,
      );
      for (const strokeWidth of [3, 5]) {
        value = {
          ...value,
          ...tool.transform!(value, { type: 'property-update', changes: { strokeWidth } }),
        };
        const box = patching.computeTextBoxFromRD(
          value.unrotatedRect ?? value.rect,
          value.rectangleDifferences,
        );
        expect(box.origin.x).toBeCloseTo(before.origin.x);
        expect(box.origin.y).toBeCloseTo(before.origin.y);
        expect(box.size.width).toBeCloseTo(150);
        expect(box.size.height).toBeCloseTo(40);
      }
      const vertices = [
        value.calloutLine![0],
        value.calloutLine![1],
        before.origin,
        { x: before.origin.x + 160, y: before.origin.y + 45 },
      ];
      value = {
        ...value,
        ...tool.transform!(value, { type: 'vertex-edit', changes: { calloutLine: vertices } }),
      };
      const box = patching.computeTextBoxFromRD(
        value.unrotatedRect ?? value.rect,
        value.rectangleDifferences,
      );
      expect(box.size.width).toBeCloseTo(160);
      expect(box.size.height).toBeCloseTo(45);
      expect(((value.rotation ?? 0) + turn * 90) % 360).toBe(0);
    });
  }
});

for (const defaults of [{}, { rotation: 90 }]) {
  it('preserves disabled upright insertion and explicit rotation defaults', () => {
    const native = defaultTools.find(
      (item) => item.id === 'freeTextCallout',
    )! as AnnotationTool<PdfFreeTextAnnoObject>;
    const tool = {
      ...native,
      defaults: { ...native.defaults, ...defaults },
      behavior: { ...native.behavior, insertUpright: defaults.rotation !== undefined },
    };
    const commit = vi.fn();
    const handlers = tool.pointerHandler!.create({
      pageIndex: 0,
      pageSize: { width: 600, height: 800 },
      pageRotation: 1,
      scale: 1,
      getTool: () => tool,
      getToolContext: () => undefined,
      services: { requestFile: vi.fn() },
      onCommit: commit,
      onPreview: vi.fn(),
    });
    const event = {} as Parameters<NonNullable<typeof handlers.onPointerDown>>[1];
    for (const point of [
      { x: 100, y: 100 },
      { x: 160, y: 120 },
      { x: 250, y: 140 },
    ]) {
      handlers.onPointerDown!(point, event, 'freeTextCallout');
      handlers.onPointerUp!(point, event, 'freeTextCallout');
    }
    expect(commit.mock.calls[0][0].rotation).toBe(defaults.rotation);
  });
}
