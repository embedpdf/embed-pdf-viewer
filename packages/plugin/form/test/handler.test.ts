/**
 * The form place handler's gesture semantics — the rules it shares with the
 * annotation handlers: page-anchored projection, the up sample as the final
 * point, a click means width and height under the shared threshold, no
 * capture without write permission, preview driven while dragging and
 * cleared on every completion path, auto-select only while the world hasn't
 * moved on. An upright tool places the field as the author sees the page: on
 * a page shown turned, its widget takes the frame and the turn that read
 * upright there.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  formWidget,
  toPageRef,
  type FormFieldDraft,
  type FormField,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { createPlaceHandler, placedOnPage } from '../src/tools/handlers';
import type { FormHostCapability } from '../src/host-contract';

const PON = 3;
const PAGE_REF = toPageRef(PON);
const PAGE = { x: 0, y: 0, width: 300, height: 400 };

const created = {
  name: 'text_1',
  widgets: [{ ...formWidget(42, PAGE_REF), rect: null }],
} as unknown as FormField;

function makeForm(over: Partial<FormHostCapability> = {}) {
  const placed: FormFieldDraft[] = [];
  const form = {
    canDesign: () => true,
    getPageBox: () => PAGE,
    // The palette places for no group, unless a test says for whom.
    getDesignGroup: () => null,
    list: () => [{ name: 'text_1' }],
    // The field shows once the engine answers, unless a test says it shows at once.
    get: () => null,
    create: vi.fn(async (draft: FormFieldDraft) => {
      placed.push(draft);
      return { field: created };
    }),
    ...over,
  } as unknown as FormHostCapability;
  return { form, placed };
}

/** The first widget of what a tool placed. */
const widgetOf = (draft: FormFieldDraft | undefined) => draft!.widgets![0]!;

type Vec = { x: number; y: number };

function makeAnnotation(
  afterCreate = { select: true, tool: 'stay', editText: true },
  /** What the annotation plugin's tool says about placing upright; the form tools register `true`. */
  upright = true,
) {
  const previews: Array<{
    toolId: string;
    page: PageRef;
    from: Vec;
    to: Vec;
    displayRotation?: number;
  }> = [];
  const ghosts: Array<{ toolId: string; page: PageRef; point: Vec }> = [];
  const selects: unknown[] = [];
  let clears = 0;
  let ghostClears = 0;
  const annotation = {
    previewPlacement: (
      toolId: string,
      page: PageRef,
      from: Vec,
      to: Vec,
      displayRotation?: number,
    ) =>
      previews.push({
        toolId,
        page,
        from,
        to,
        ...(displayRotation !== undefined ? { displayRotation } : {}),
      }),
    clearPlacementPreview: () => {
      clears++;
    },
    hoverGhostAt: (toolId: string, page: PageRef, point: Vec) =>
      ghosts.push({ toolId, page, point }),
    clearGhost: () => {
      ghostClears++;
    },
    selection: { select: ([ref]: unknown[]) => selects.push(ref) },
    getSettings: () => ({ afterCreate }),
    getResolvedTool: () => ({ upright }),
    tools: {
      getDefaults: () => ({ interiorColor: '#ffffff', color: '#6b7280', strokeWidth: 1 }),
    },
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

const interactionFor = (
  toolId: string,
  claimed = false,
  activateTool: (id: string) => void = () => {},
): InteractionHostCapability =>
  ({
    getActiveToolId: () => toolId,
    hasCursorClaim: () => claimed,
    activateTool,
  }) as unknown as InteractionHostCapability;

const sample = (over: Partial<PointerSample>): PointerSample => ({
  phase: 'move',
  viewport: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  ...over,
});
const at = (
  phase: PointerSample['phase'],
  x: number,
  y: number,
  rotation?: 0 | 90 | 180 | 270,
): PointerSample =>
  sample({
    phase,
    page: { ref: PAGE_REF, point: { x, y }, ...(rotation !== undefined ? { rotation } : {}) },
  });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('form place handler', () => {
  it('a CLICK places the tool default size CENTRED on the point (shared placement)', async () => {
    const { form, placed } = makeForm();
    const { annotation } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    expect(handler.onPointerDown(at('down', 100, 100))).toBe(true);
    handler.onPointerUp?.(at('up', 101, 101)); // sub-threshold in both axes
    await flush();
    expect(placed).toHaveLength(1);
    // The next free name: the form already has `text_1`.
    expect(placed[0]).toMatchObject({ kind: 'text', name: 'text_2' });
    expect(widgetOf(placed[0])).toMatchObject({
      page: PAGE_REF,
      // 160×24 centred on the down point (the core's `d.from` rule).
      box: { x: 20, y: 88, width: 160, height: 24 },
      strokeWidth: 1,
    });
    // Upright on an unturned page: no turn is stated.
    expect(widgetOf(placed[0])).not.toHaveProperty('rotation');
  });

  // On a page shown turned, a field reads upright: its turn undoes the page's, and its
  // frame shows the tool's size as the author sees the page.
  it.each([
    [90, 270, { x: 88, y: 20, width: 24, height: 160 }],
    [180, 180, { x: 20, y: 88, width: 160, height: 24 }],
    [270, 90, { x: 88, y: 20, width: 24, height: 160 }],
  ] as const)(
    'a CLICK on a page shown turned %i° places the field upright: turn %i°',
    async (displayRotation, rotation, stands) => {
      const { form, placed } = makeForm();
      const { annotation } = makeAnnotation();
      const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
      handler.onPointerDown(at('down', 100, 100, displayRotation));
      handler.onPointerUp?.(at('up', 100, 100, displayRotation));
      await flush();
      const widget = widgetOf(placed[0]);
      // The frame its contents are laid out in: 160 × 24, about the click.
      expect(widget.box).toEqual({ x: 20, y: 88, width: 160, height: 24 });
      expect(widget.rotation).toBe(rotation);
      expect(widget).not.toHaveProperty('rect');
      // Where it stands on the page: the frame turned, on the page.
      expect(placedOnPage({ kind: 'box', rect: widget.box!, rot: rotation }, PAGE)).toEqual({
        box: widget.box,
        rotation,
      });
      expect(stands.width).toBe(displayRotation === 180 ? 160 : 24);
    },
  );

  it('a DRAG on a page shown turned 90° keeps the dragged region, its contents turned upright', async () => {
    const { form, placed } = makeForm();
    const { annotation, previews } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    handler.onPointerDown(at('down', 50, 60, 90));
    handler.onPointerMove?.(at('move', 80, 200, 90));
    // The preview is laid out by the press's display rotation, as the commit is.
    expect(previews.at(-1)).toMatchObject({ displayRotation: 90 });
    handler.onPointerUp?.(at('up', 80, 200, 90));
    await flush();
    const widget = widgetOf(placed[0]);
    // The dragged region is 30 × 140; the frame is that with its sides swapped, about its middle.
    expect(widget.box).toEqual({ x: -5, y: 115, width: 140, height: 30 });
    expect(widget.rotation).toBe(270);
  });

  it('without the annotation plugin, the tool table says it places upright', async () => {
    const { form, placed } = makeForm();
    const handler = createPlaceHandler(form, interactionFor('form-checkbox'), null);
    handler.onPointerDown(at('down', 100, 100, 90));
    handler.onPointerUp?.(at('up', 100, 100, 90));
    await flush();
    expect(widgetOf(placed[0])).toMatchObject({
      box: { x: 91, y: 91, width: 18, height: 18 },
      rotation: 270,
    });
  });

  it('a tool the app made not upright places along the page, unturned', async () => {
    const { form, placed } = makeForm();
    const { annotation } = makeAnnotation(undefined, false);
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    handler.onPointerDown(at('down', 100, 100, 90));
    handler.onPointerUp?.(at('up', 100, 100, 90));
    await flush();
    expect(widgetOf(placed[0]).box).toEqual({ x: 20, y: 88, width: 160, height: 24 });
    expect(widgetOf(placed[0])).not.toHaveProperty('rotation');
  });

  it('a turned field near the edge is kept on the page where it stands', () => {
    // A 160 × 24 frame turned 90° stands 24 × 160; the page is 300 × 400.
    const placed = placedOnPage(
      { kind: 'box', rect: { x: 200, y: 300, width: 160, height: 24 }, rot: 90 },
      PAGE,
    );
    // It stands at x 268..292, y 232..392: wholly on the page, so nothing is cut.
    expect(placed).toEqual({ box: { x: 200, y: 300, width: 160, height: 24 }, rotation: 90 });
    // One that stands past the page's bottom (y 272..432) is cut there (272..400), and its
    // frame follows: 128 long, about the new middle.
    const cut = placedOnPage(
      { kind: 'box', rect: { x: 200, y: 340, width: 160, height: 24 }, rot: 90 },
      PAGE,
    );
    expect(cut).toEqual({ box: { x: 216, y: 324, width: 128, height: 24 }, rotation: 90 });
  });

  it('a THIN drag is a DRAG, never a click placement (width AND height rule)', async () => {
    const { form, placed } = makeForm();
    const handler = createPlaceHandler(form, interactionFor('form-text'), null);
    handler.onPointerDown(at('down', 50, 50));
    handler.onPointerUp?.(at('up', 150, 52)); // 100×2 — one axis under threshold
    await flush();
    expect(widgetOf(placed[0]).box).toEqual({ x: 50, y: 50, width: 100, height: 2 });
  });

  it('tracks the HOME page through the projection; the UP sample is final', async () => {
    const { form, placed } = makeForm();
    const handler = createPlaceHandler(form, interactionFor('form-text'), null);
    handler.onPointerDown(at('down', 10, 10));
    // Cursor physically over another page; projection speaks for the home page.
    handler.onPointerMove?.(
      sample({
        page: { ref: toPageRef(99), point: { x: 1, y: 1 } },
        project: (page) => (page.objectNumber === PON ? { x: 90, y: 40 } : null),
      }),
    );
    handler.onPointerUp?.(
      sample({
        phase: 'up',
        project: (page) => (page.objectNumber === PON ? { x: 110, y: 60 } : null),
      }),
    );
    await flush();
    expect(widgetOf(placed[0]).box).toEqual({ x: 10, y: 10, width: 100, height: 50 });
  });

  it('declines the gesture without write permission (edit/pan still route)', () => {
    const { form } = makeForm({ canDesign: () => false } as Partial<FormHostCapability>);
    const handler = createPlaceHandler(form, interactionFor('form-text'), null);
    expect(handler.onPointerDown(at('down', 10, 10))).toBe(false);
  });

  it('reports the gesture to the placement preview while it moves, and clears it on up', async () => {
    const { form } = makeForm();
    const { annotation, previews, clears, ghostClears } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-checkbox'), annotation);
    handler.onPointerDown(at('down', 10, 10));
    // The annotation plugin paints it once it is a drag; under that, the ghost shows the click.
    handler.onPointerMove?.(at('move', 60, 40));
    expect(previews.at(-1)).toEqual({
      toolId: 'form-checkbox',
      page: PAGE_REF,
      from: { x: 10, y: 10 },
      to: { x: 60, y: 40 },
    });
    handler.onPointerUp?.(at('up', 60, 40));
    // Every completion path drops the preview and the ghost.
    expect(clears()).toBe(1);
    expect(ghostClears()).toBe(1);
    await flush();
  });

  it('a cancel places nothing and drops what the gesture painted', async () => {
    const { form, placed } = makeForm();
    const { annotation, clears, ghostClears } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    handler.onPointerDown(at('down', 10, 10));
    handler.onPointerMove?.(at('move', 60, 40));
    handler.onPointerCancel?.(sample({ phase: 'cancel' }));
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
    handler.onPointerDown(at('down', 100, 100));
    handler.onPointerUp?.(at('up', 100, 100));
    await flush();
    expect(selects).toEqual([{ kind: 'objectNumber', objectNumber: 42, page: PAGE_REF }]);

    // Tool changes while the engine write runs → stale, no selection.
    let live = 'form-text';
    const interaction = {
      getActiveToolId: () => live,
      activateDefaultTool: () => {},
    } as unknown as InteractionHostCapability;
    const second = makeAnnotation();
    const h2 = createPlaceHandler(form, interaction, second.annotation);
    h2.onPointerDown(at('down', 100, 100));
    h2.onPointerUp?.(at('up', 100, 100));
    live = 'pointer';
    await flush();
    expect(second.selects).toHaveLength(0);
  });

  it('selects a field that shows at once in the same frame', () => {
    const { form } = makeForm({ get: () => created });
    const { annotation, selects } = makeAnnotation();
    const handler = createPlaceHandler(form, interactionFor('form-text'), annotation);
    handler.onPointerDown(at('down', 100, 100));
    handler.onPointerUp?.(at('up', 100, 100));
    expect(selects).toEqual([{ kind: 'objectNumber', objectNumber: 42, page: PAGE_REF }]);
  });

  it('follows the annotation afterCreate setting: no selection, back to the design tool', async () => {
    const { form } = makeForm();
    const { annotation, selects } = makeAnnotation({
      select: false,
      tool: 'default',
      editText: true,
    });
    const activateTool = vi.fn();
    const handler = createPlaceHandler(
      form,
      interactionFor('form-text', false, activateTool),
      annotation,
    );
    handler.onPointerDown(at('down', 100, 100));
    handler.onPointerUp?.(at('up', 100, 100));
    await flush();
    expect(selects).toHaveLength(0);
    // Design's resting tool, not the default pointer, which fills and would end design.
    expect(activateTool.mock.calls).toEqual([['form-edit']]);
  });

  it('a radio button stands for Choice1, a dropdown starts with two options', async () => {
    const { form, placed } = makeForm();
    for (const tool of ['form-radio', 'form-combobox']) {
      const handler = createPlaceHandler(form, interactionFor(tool), null);
      handler.onPointerDown(at('down', 100, 100));
      handler.onPointerUp?.(at('up', 100, 100));
    }
    await flush();
    expect(widgetOf(placed[0])).toMatchObject({ exportValue: 'Choice1' });
    expect(placed[1]).toMatchObject({ kind: 'combobox', name: 'combobox_1' });
    expect((placed[1] as { options: unknown[] }).options).toHaveLength(2);
  });

  it('places the field for the group the palette places for, and names none without one', async () => {
    const own = makeForm();
    const forBuyer = makeForm({ getDesignGroup: () => 'buyer' } as Partial<FormHostCapability>);
    for (const { form } of [own, forBuyer]) {
      const handler = createPlaceHandler(form, interactionFor('form-text'), null);
      handler.onPointerDown(at('down', 100, 100));
      handler.onPointerUp?.(at('up', 100, 100));
    }
    await flush();
    expect(own.placed[0]).not.toHaveProperty('groupId');
    expect(forBuyer.placed[0]).toMatchObject({ kind: 'text', name: 'text_2', groupId: 'buyer' });
  });

  it('a rejected create is contained (logged, no unhandled rejection)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { form } = makeForm({
        create: vi.fn(async () => {
          throw new Error('nope');
        }),
      } as Partial<FormHostCapability>);
      const handler = createPlaceHandler(form, interactionFor('form-text'), null);
      handler.onPointerDown(at('down', 100, 100));
      handler.onPointerUp?.(at('up', 100, 100));
      await flush();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
