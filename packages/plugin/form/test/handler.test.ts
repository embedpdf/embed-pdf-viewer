/**
 * The form place handler's gesture semantics — the rules it shares with the
 * annotation handlers: page-anchored projection, the UP sample as the final
 * point, a CLICK means width AND height under the shared threshold, no
 * capture without write permission, preview driven while dragging and
 * cleared on every completion path, auto-select only while the world hasn't
 * moved on.
 */
import { describe, expect, it, vi } from 'vitest';
import type { InteractionCapability, PointerSample } from '@embedpdf/plugin-interaction';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/internal';

import { createPlaceHandler } from '../src/handler';
import type { FormCapability, PlacedField, PlaceFieldInput } from '../src/types';

const PON = 3;
const PAGE = { x: 0, y: 0, width: 300, height: 400 };

function makeForm(over: Partial<FormCapability> = {}) {
  const placed: PlaceFieldInput[] = [];
  let resolveNext: PlacedField = {
    field: { name: 'text_1' } as PlacedField['field'],
    widget: { annotObjectNumber: 42, pageObjectNumber: PON } as PlacedField['widget'],
  };
  const form = {
    canDesign: () => true,
    pageBox: () => PAGE,
    placeField: vi.fn(async (input: PlaceFieldInput) => {
      placed.push(input);
      return resolveNext;
    }),
    ...over,
  } as unknown as FormCapability;
  return { form, placed, setResult: (r: PlacedField) => (resolveNext = r) };
}

function makeAnnotation() {
  const previews: Array<{ toolId: string; pon: number; box: unknown }> = [];
  const selects: unknown[] = [];
  let clears = 0;
  const annotation = {
    setPlacementPreview: (toolId: string, pon: number, box: unknown) =>
      previews.push({ toolId, pon, box }),
    clearPlacementPreview: () => {
      clears++;
    },
    select: (ref: unknown) => selects.push(ref),
    currentDefaults: () => ({ interiorColor: '#ffffff', color: '#6b7280', strokeWidth: 1 }),
  } as unknown as AnnotationHostCapability;
  return { annotation, previews, selects, clears: () => clears };
}

const interactionFor = (toolId: string): InteractionCapability =>
  ({ activeToolId: () => toolId }) as unknown as InteractionCapability;

const sample = (over: Partial<PointerSample>): PointerSample => ({
  phase: 'move',
  viewport: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  ...over,
});
const at = (phase: PointerSample['phase'], x: number, y: number): PointerSample =>
  sample({ phase, page: { pon: PON, point: { x, y } } });

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('form place handler', () => {
  it('a CLICK places the tool default size CENTRED on the point (shared placement)', async () => {
    const { form, placed } = makeForm();
    const { annotation } = makeAnnotation();
    const h = createPlaceHandler(form, interactionFor('form-text'), annotation);
    expect(h.onDown(at('down', 100, 100))).toBe(true);
    h.onUp?.(at('up', 101, 101)); // sub-threshold in BOTH axes
    await flush();
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({
      family: 'text',
      pageObjectNumber: PON,
      // 160×24 centred on the DOWN point (the core's `d.from` rule).
      box: { x: 20, y: 88, width: 160, height: 24 },
    });
    expect(placed[0]!.appearance).toMatchObject({ strokeWidth: 1 });
  });

  it('a THIN drag is a DRAG, never a click placement (width AND height rule)', async () => {
    const { form, placed } = makeForm();
    const h = createPlaceHandler(form, interactionFor('form-text'), null);
    h.onDown(at('down', 50, 50));
    h.onUp?.(at('up', 150, 52)); // 100×2 — one axis under threshold
    await flush();
    expect(placed[0]!.box).toEqual({ x: 50, y: 50, width: 100, height: 2 });
  });

  it('tracks the HOME page through the projection; the UP sample is final', async () => {
    const { form, placed } = makeForm();
    const h = createPlaceHandler(form, interactionFor('form-text'), null);
    h.onDown(at('down', 10, 10));
    // Cursor physically over another page; projection speaks for the home page.
    h.onMove?.(
      sample({
        page: { pon: 99, point: { x: 1, y: 1 } },
        project: (pon) => (pon === PON ? { x: 90, y: 40 } : null),
      }),
    );
    h.onUp?.(sample({ phase: 'up', project: (pon) => (pon === PON ? { x: 110, y: 60 } : null) }));
    await flush();
    expect(placed[0]!.box).toEqual({ x: 10, y: 10, width: 100, height: 50 });
  });

  it('declines the gesture without write permission (edit/pan still route)', () => {
    const { form } = makeForm({ canDesign: () => false } as Partial<FormCapability>);
    const h = createPlaceHandler(form, interactionFor('form-text'), null);
    expect(h.onDown(at('down', 10, 10))).toBe(false);
  });

  it('drives the placement preview while dragging and clears it on up', async () => {
    const { form } = makeForm();
    const { annotation, previews, clears } = makeAnnotation();
    const h = createPlaceHandler(form, interactionFor('form-checkbox'), annotation);
    h.onDown(at('down', 10, 10));
    h.onMove?.(at('move', 11, 11)); // under threshold → no preview yet
    expect(previews).toHaveLength(0);
    h.onMove?.(at('move', 60, 40));
    expect(previews.at(-1)).toMatchObject({
      toolId: 'form-checkbox',
      pon: PON,
      box: { x: 10, y: 10, width: 50, height: 30 },
    });
    const before = clears();
    h.onUp?.(at('up', 60, 40));
    expect(clears()).toBe(before + 1); // every completion path drops the preview
    await flush();
  });

  it('auto-selects the created widget — unless the tool changed mid-flight', async () => {
    const { form } = makeForm();
    const { annotation, selects } = makeAnnotation();
    const h = createPlaceHandler(form, interactionFor('form-text'), annotation);
    h.onDown(at('down', 100, 100));
    h.onUp?.(at('up', 100, 100));
    await flush();
    expect(selects).toEqual([
      { kind: 'objectNumber', annotObjectNumber: 42, pageObjectNumber: PON },
    ]);

    // Tool changes while the engine write runs → stale, no selection.
    let live = 'form-text';
    const interaction = { activeToolId: () => live } as unknown as InteractionCapability;
    const second = makeAnnotation();
    const h2 = createPlaceHandler(form, interaction, second.annotation);
    h2.onDown(at('down', 100, 100));
    h2.onUp?.(at('up', 100, 100));
    live = 'pointer';
    await flush();
    expect(second.selects).toHaveLength(0);
  });

  it('a rejected placeField is contained (logged, no unhandled rejection)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { form } = makeForm({
        placeField: vi.fn(async () => {
          throw new Error('nope');
        }),
      } as Partial<FormCapability>);
      const h = createPlaceHandler(form, interactionFor('form-text'), null);
      h.onDown(at('down', 100, 100));
      h.onUp?.(at('up', 100, 100));
      await flush();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
