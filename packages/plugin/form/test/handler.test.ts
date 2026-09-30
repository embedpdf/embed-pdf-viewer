import { formWidget } from '@embedpdf/engine-core/runtime';
/**
 * The form place handler's gesture semantics — the rules it shares with the
 * annotation handlers: page-anchored projection, the up sample as the final
 * point, a click means width and height under the shared threshold, no
 * capture without write permission, preview driven while dragging and
 * cleared on every completion path, auto-select only while the world hasn't
 * moved on.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import { toPageRef, type PageRef } from '@embedpdf/engine-core/runtime';

import { createPlaceHandler } from '../src/tools/handlers';
import type { CreatedField, CreateFieldInput, FormHostCapability } from '../src/host-contract';

const PON = 3;
const PAGE_REF = toPageRef(PON);
const PAGE = { x: 0, y: 0, width: 300, height: 400 };

function makeForm(over: Partial<FormHostCapability> = {}) {
  const placed: CreateFieldInput[] = [];
  let resolveNext: CreatedField = {
    field: { name: 'text_1' } as CreatedField['field'],
    widget: formWidget(42, PAGE_REF) as CreatedField['widget'],
  };
  const form = {
    canDesign: () => true,
    getPageBox: () => PAGE,
    createField: vi.fn(async (input: CreateFieldInput) => {
      placed.push(input);
      return resolveNext;
    }),
    ...over,
  } as unknown as FormHostCapability;
  return { form, placed, setResult: (created: CreatedField) => (resolveNext = created) };
}

type Vec = { x: number; y: number };

function makeAnnotation() {
  const previews: Array<{ toolId: string; page: PageRef; from: Vec; to: Vec }> = [];
  const ghosts: Array<{ toolId: string; page: PageRef; point: Vec }> = [];
  const selects: unknown[] = [];
  let clears = 0;
  let ghostClears = 0;
  const annotation = {
    previewPlacement: (toolId: string, page: PageRef, from: Vec, to: Vec) =>
      previews.push({ toolId, page, from, to }),
    clearPlacementPreview: () => {
      clears++;
    },
    hoverGhostAt: (toolId: string, page: PageRef, point: Vec) =>
      ghosts.push({ toolId, page, point }),
    clearGhost: () => {
      ghostClears++;
    },
    select: (ref: unknown) => selects.push(ref),
    getToolDefaults: () => ({ interiorColor: '#ffffff', color: '#6b7280', strokeWidth: 1 }),
  } as unknown as AnnotationHostCapability;
  return {
    annotation,
    previews,
    ghosts,
    selects,
    clears: () => clears,
    ghostClears: () => ghostClears,
  };
}

const interactionFor = (toolId: string, claimed = false): InteractionHostCapability =>
  ({
    getActiveToolId: () => toolId,
    hasCursorClaim: () => claimed,
  }) as unknown as InteractionHostCapability;

const sample = (over: Partial<PointerSample>): PointerSample => ({
  phase: 'move',
  viewport: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  ...over,
});
const at = (phase: PointerSample['phase'], x: number, y: number): PointerSample =>
  sample({ phase, page: { ref: PAGE_REF, point: { x, y } } });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('form place handler', () => {
  it('a CLICK places the tool default size CENTRED on the point (shared placement)', async () => {
    const { form, placed } = makeForm();
    const { annotation } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    expect(handler.onDown(at('down', 100, 100))).toBe(true);
    handler.onUp?.(at('up', 101, 101)); // sub-threshold in both axes
    await flush();
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({
      family: 'text',
      page: PAGE_REF,
      // 160×24 centred on the down point (the core's `d.from` rule).
      bounds: { x: 20, y: 88, width: 160, height: 24 },
    });
    expect(placed[0]!.appearance).toMatchObject({ strokeWidth: 1 });
  });

  it('a THIN drag is a DRAG, never a click placement (width AND height rule)', async () => {
    const { form, placed } = makeForm();
    const handler = createPlaceHandler(form, interactionFor('form-text'), null);
    handler.onDown(at('down', 50, 50));
    handler.onUp?.(at('up', 150, 52)); // 100×2 — one axis under threshold
    await flush();
    expect(placed[0]!.bounds).toEqual({ x: 50, y: 50, width: 100, height: 2 });
  });

  it('tracks the HOME page through the projection; the UP sample is final', async () => {
    const { form, placed } = makeForm();
    const handler = createPlaceHandler(form, interactionFor('form-text'), null);
    handler.onDown(at('down', 10, 10));
    // Cursor physically over another page; projection speaks for the home page.
    handler.onMove?.(
      sample({
        page: { ref: toPageRef(99), point: { x: 1, y: 1 } },
        project: (page) => (page.objectNumber === PON ? { x: 90, y: 40 } : null),
      }),
    );
    handler.onUp?.(
      sample({
        phase: 'up',
        project: (page) => (page.objectNumber === PON ? { x: 110, y: 60 } : null),
      }),
    );
    await flush();
    expect(placed[0]!.bounds).toEqual({ x: 10, y: 10, width: 100, height: 50 });
  });

  it('declines the gesture without write permission (edit/pan still route)', () => {
    const { form } = makeForm({ canDesign: () => false } as Partial<FormHostCapability>);
    const handler = createPlaceHandler(form, interactionFor('form-text'), null);
    expect(handler.onDown(at('down', 10, 10))).toBe(false);
  });

  it('reports the gesture to the placement preview while it moves, and clears it on up', async () => {
    const { form } = makeForm();
    const { annotation, previews, clears, ghostClears } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-checkbox'), annotation);
    handler.onDown(at('down', 10, 10));
    // The annotation plugin paints it once it is a drag; under that, the ghost shows the click.
    handler.onMove?.(at('move', 60, 40));
    expect(previews.at(-1)).toEqual({
      toolId: 'form-checkbox',
      page: PAGE_REF,
      from: { x: 10, y: 10 },
      to: { x: 60, y: 40 },
    });
    handler.onUp?.(at('up', 60, 40));
    // Every completion path drops the preview and the ghost.
    expect(clears()).toBe(1);
    expect(ghostClears()).toBe(1);
    await flush();
  });

  it('a cancel places nothing and drops what the gesture painted', async () => {
    const { form, placed } = makeForm();
    const { annotation, clears, ghostClears } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    handler.onDown(at('down', 10, 10));
    handler.onMove?.(at('move', 60, 40));
    handler.onCancel?.(sample({ phase: 'cancel' }));
    await flush();
    expect(placed).toHaveLength(0);
    expect(clears()).toBe(1);
    expect(ghostClears()).toBe(1);
  });

  it('its hover shows the tool’s ghost only where a click places a field', () => {
    const { form } = makeForm();
    const shown = makeAnnotation();
    createPlaceHandler(form, interactionFor('form-radio'), shown.annotation).onHover?.(
      at('move', 100, 100),
    );
    expect(shown.ghosts).toEqual([
      { toolId: 'form-radio', page: PAGE_REF, point: { x: 100, y: 100 } },
    ]);
    // Over a widget or annotation (a hover claim), without design permission, off the page.
    const cases = [
      [makeForm().form, interactionFor('form-radio', true), at('move', 100, 100)],
      [
        makeForm({ canDesign: () => false } as Partial<FormHostCapability>).form,
        interactionFor('form-radio'),
        at('move', 100, 100),
      ],
      [makeForm().form, interactionFor('form-radio'), sample({})],
    ] as const;
    for (const [caseForm, interaction, where] of cases) {
      const hidden = makeAnnotation();
      createPlaceHandler(caseForm, interaction, hidden.annotation).onHover?.(where);
      expect(hidden.ghosts).toHaveLength(0);
      expect(hidden.ghostClears()).toBe(1);
    }
  });

  it('auto-selects the created widget — unless the tool changed mid-flight', async () => {
    const { form } = makeForm();
    const { annotation, selects } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    handler.onDown(at('down', 100, 100));
    handler.onUp?.(at('up', 100, 100));
    await flush();
    expect(selects).toEqual([{ kind: 'objectNumber', objectNumber: 42, page: PAGE_REF }]);

    // Tool changes while the engine write runs → stale, no selection.
    let live = 'form-text';
    const interaction = { getActiveToolId: () => live } as unknown as InteractionHostCapability;
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
        createField: vi.fn(async () => {
          throw new Error('nope');
        }),
      } as Partial<FormHostCapability>);
      const handler = createPlaceHandler(form, interactionFor('form-text'), null);
      handler.onDown(at('down', 100, 100));
      handler.onUp?.(at('up', 100, 100));
      await flush();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
