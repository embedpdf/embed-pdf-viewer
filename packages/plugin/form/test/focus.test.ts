/**
 * The cursor among the fields: `focus()` brings a box into view and puts the cursor in its
 * control, now or once its page comes in; `focusNext()` goes the way Tab does, across pages,
 * skipping what can't be filled in, a radio group being one stop; the arrow keys pick between a
 * group's buttons; the field the cursor is in follows the controls' focus and blur.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  formWidget,
  toPageRef,
  type AnnotationRef,
  type FormField,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import { createTestContext, manualClock } from '@embedpdf/core/testing';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { FORM_DEFAULTS } from '../src/contract';
import { createFormController } from '../src/controller';
import type { FormFocusTarget } from '../src/host-contract';
import { initialFormModel } from '../src/model';

const P1 = toPageRef(1);
const P2 = toPageRef(2);

const base = {
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  groupId: null,
  purpose: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
} as const;

const fieldRef = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

/** A text field `name` with one box, object number `widget`, on `page`. */
const text = (field: number, name: string, widget: number, page: typeof P1, value = '') =>
  ({
    ...base,
    ref: fieldRef(field),
    name,
    kind: 'text',
    valueEntry: { kind: 'scalar', value },
    defaultValueEntry: { kind: 'scalar', value: '' },
    widgets: [formWidget(widget, page)],
    value,
    defaultValue: '',
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
  }) as unknown as FormField;

const NAME = text(1, 'name', 11, P1);
const EMAIL = text(2, 'email', 12, P1, 'ada@example.com');
const LOCKED = { ...text(3, 'id', 13, P1), readOnly: true } as FormField;
const CITY = text(4, 'city', 14, P2);
// A field whose only box has no size: it shows nowhere, as a document timestamp's field does.
const GHOST = text(6, 'ghost', 17, P2);
const PLAN = {
  ...base,
  ref: fieldRef(5),
  name: 'plan',
  kind: 'radio',
  value: 'yearly',
  radiosInUnison: false,
  noToggleToOff: false,
  valueEntry: { kind: 'scalar', value: 'yearly' },
  defaultValueEntry: { kind: 'scalar', value: 'Off' },
  widgets: [
    { ...formWidget(15, P2), onState: 'monthly', exportValue: 'monthly', checked: false },
    { ...formWidget(16, P2), onState: 'yearly', exportValue: 'yearly', checked: true },
  ],
} as unknown as FormField;

/** An unsigned signature field `name` with one box, object number `widget`, on `page`. */
const signature = (field: number, name: string, widget: number, page: typeof P1) =>
  ({
    ...base,
    ref: fieldRef(field),
    name,
    kind: 'signature',
    valueEntry: { kind: 'none' },
    defaultValueEntry: { kind: 'none' },
    widgets: [formWidget(widget, page)],
  }) as unknown as FormField;

/** A box's row: on `page`, at `y` (page space, y down). */
const row = (
  objectNumber: number,
  page: typeof P1,
  y: number,
  structurePosition: number[] | null = null,
) =>
  ({
    subtype: 'widget',
    ref: { kind: 'objectNumber', page, objectNumber },
    page,
    rect: { x: 50, y, width: 200, height: 20 },
    structurePosition,
  }) as unknown as WidgetAnnotation;

// Page 1 lists its boxes bottom first, and reads in rows: name (top), email, then the locked id.
// Its tags read email, name, then the locked id.
const snapshot: FormSnapshot = {
  formKind: 'acroform',
  needsAppearances: false,
  widgets: [
    row(13, P1, 300, [0, 0, 2]),
    row(12, P1, 200, [0, 0, 0]),
    row(11, P1, 100, [0, 0, 1]),
    row(14, P2, 100),
    row(15, P2, 200),
    row(16, P2, 250),
    { ...row(17, P2, 400), rect: { x: 0, y: 792, width: 0, height: 0 } } as WidgetAnnotation,
  ],
  fields: [NAME, EMAIL, LOCKED, CITY, PLAN, GHOST],
  calculationOrder: [],
};

const widgetRef = (objectNumber: number, page: typeof P1): AnnotationRef =>
  ({ kind: 'objectNumber', page, objectNumber }) as AnnotationRef;

async function form({
  stage = true,
  tabs = 'rows' as 'rows' | 'structure',
  fields = snapshot.fields,
  widgets = snapshot.widgets,
  shown = [11, 12, 13],
}: {
  stage?: boolean;
  tabs?: 'rows' | 'structure';
  fields?: FormField[];
  widgets?: WidgetAnnotation[];
  /** Page 1's boxes whose controls are on screen from the start. */
  shown?: number[];
} = {}) {
  const time = manualClock();
  const reveal = vi.fn();
  const apply = vi.fn(async () => ({ items: [], meta: { undoable: true } }));
  const ctx = createTestContext({
    id: 'form',
    state: initialFormModel(),
    settings: { defaults: FORM_DEFAULTS },
    pages: [{ ref: P1, tabOrder: tabs }, { ref: P2 }],
    clock: time.clock,
    capabilities: [
      [
        InteractionToken,
        {
          registerTool: () => () => {},
          registerHandler: () => () => {},
          getActiveTool: () => ({ id: 'pointer', enables: new Set(['form-fill']) }),
        },
      ],
      ...(stage ? [[StageToken, { reveal }] as const] : []),
    ],
    doc: {
      forms: { list: vi.fn(async () => ({ ...snapshot, widgets, fields })), create: vi.fn() },
      apply,
      security: { allows: () => true, allowsField: () => true },
    } as never,
  });
  const capability = ctx.connect(createFormController(ctx));
  await capability.refresh();
  await vi.waitFor(() => expect(capability.getSnapshot()).not.toBeNull());

  // The controls on screen: page 1's, until a test brings page 2 in.
  const focused: number[] = [];
  const selected: boolean[] = [];
  const show = (objectNumber: number, page: typeof P1) => {
    const target: FormFocusTarget = {
      focus: ({ select }) => {
        focused.push(objectNumber);
        selected.push(select);
        // The control reports its focus, as the form layer's do.
        const field = capability.getFieldForWidget(widgetRef(objectNumber, page))!;
        capability.notifyWidgetEvent(field.ref, widgetRef(objectNumber, page), 'focus');
      },
    };
    return capability.attachFocusTarget(widgetRef(objectNumber, page), target);
  };
  /**
   * A box on screen that holds nothing to focus, as the form layer shows a signature field
   * nothing can sign: asked to take the cursor, nothing happens. `takes` answers for it later.
   */
  const showEmpty = (objectNumber: number, page: typeof P1, takes: () => boolean = () => false) =>
    capability.attachFocusTarget(widgetRef(objectNumber, page), {
      takesCursor: takes,
      focus: () => {},
    });
  for (const objectNumber of shown) show(objectNumber, P1);
  return { capability, reveal, focused, selected, show, showEmpty, time, apply };
}

describe('focus()', () => {
  it('brings the box into view and puts the cursor in its control at once', async () => {
    const { capability, reveal, focused } = await form();
    expect(capability.focus(EMAIL.ref, { select: true })).toBe(true);
    expect(reveal).toHaveBeenCalledWith(P1, { rect: { x: 50, y: 200, width: 200, height: 20 } });
    expect(focused).toEqual([12]);
    expect(capability.getFocusedField()?.name).toBe('email');
  });

  it('puts the cursor in a box whose page comes in later, once its control arrives', async () => {
    const { capability, reveal, focused, show } = await form();
    expect(capability.focus(CITY.ref)).toBe(true);
    expect(reveal).toHaveBeenCalledWith(P2, expect.anything());
    expect(focused).toEqual([]);
    show(14, P2);
    expect(focused).toEqual([14]);
  });

  it("gives up on a page that doesn't come in, so a late one can't take the cursor", async () => {
    const { capability, focused, show, time } = await form();
    capability.focus(CITY.ref);
    time.advance(2000);
    show(14, P2);
    expect(focused).toEqual([]);
  });

  it('is false for a box off screen with no Stage to bring it in, so Tab can leave', async () => {
    const { capability } = await form({ stage: false });
    expect(capability.focus(NAME.ref)).toBe(true);
    expect(capability.focus(CITY.ref)).toBe(false);
  });

  it('is false for a field the user cannot fill in, and for one the form does not have', async () => {
    const { capability, reveal } = await form();
    expect(capability.focus(LOCKED.ref)).toBe(false);
    expect(capability.focus(fieldRef(99))).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
  });

  it("goes to a radio group's checked button, or the one asked for", async () => {
    const { capability, focused, show } = await form();
    show(15, P2);
    show(16, P2);
    capability.focus(PLAN.ref);
    expect(focused).toEqual([16]);
    capability.focus(PLAN.ref, { widget: widgetRef(15, P2) });
    expect(focused).toEqual([16, 15]);
  });
});

describe('focusNext()', () => {
  it("goes the document's way: page 1 in rows, then page 2, skipping what can't be filled in", async () => {
    const { capability, focused, selected, show } = await form();
    show(14, P2);
    show(15, P2);
    show(16, P2);
    // Nothing focused yet: the start of the form.
    expect(capability.focusNext()).toBe(true);
    expect(capability.focusNext()).toBe(true);
    // The locked id (13) is skipped.
    expect(capability.focusNext()).toBe(true);
    // The radio group is one stop: its checked button.
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11, 12, 14, 16]);
    // Tab selects a text box's text.
    expect(selected).toEqual([true, true, true, true]);
    // Past the last field: no more; Tab leaves the form.
    expect(capability.focusNext()).toBe(false);
    expect(capability.focusNext({ wrap: true })).toBe(true);
    expect(focused.at(-1)).toBe(11);
  });

  it('passes over a box of no size, which shows nowhere', async () => {
    const { capability, focused, show } = await form();
    show(14, P2);
    show(15, P2);
    show(16, P2);
    show(17, P2);
    for (let stop = 0; stop < 4; stop++) capability.focusNext();
    expect(focused).toEqual([11, 12, 14, 16]);
    // The field after the radio group has a box of no size: Tab leaves the form.
    expect(capability.focusNext()).toBe(false);
    expect(capability.focus(GHOST.ref)).toBe(false);
    expect(focused).toEqual([11, 12, 14, 16]);
  });

  it("follows a page's tags when its /Tabs says structure", async () => {
    const { capability, focused, show } = await form({ tabs: 'structure' });
    show(14, P2);
    expect(capability.focusNext()).toBe(true);
    expect(capability.focusNext()).toBe(true);
    expect(capability.focusNext()).toBe(true);
    // Page 1's tags read email, then name; page 2 says nothing, so its own order.
    expect(focused).toEqual([12, 11, 14]);
  });

  it('goes backward as Shift+Tab does, into a radio group at its checked button', async () => {
    const { capability, focused, show } = await form();
    show(14, P2);
    show(16, P2);
    capability.focus(NAME.ref);
    expect(capability.focusNext({ backward: true })).toBe(false);
    expect(capability.focusNext({ backward: true, wrap: true })).toBe(true);
    expect(focused).toEqual([11, 16]);
  });

  it('with `wrap`, takes what lies on its way before it goes round', async () => {
    const { capability, focused, show } = await form();
    show(14, P2);
    show(16, P2);
    // From email, the second stop: back to name, and only from name round to the last.
    capability.focus(EMAIL.ref);
    expect(capability.focusNext({ backward: true, wrap: true })).toBe(true);
    expect(capability.focusNext({ backward: true, wrap: true })).toBe(true);
    expect(focused).toEqual([12, 11, 16]);
    // Forward the same: from city on to the group, and only from the group round to name.
    capability.focus(CITY.ref);
    expect(capability.focusNext({ wrap: true })).toBe(true);
    expect(capability.focusNext({ wrap: true })).toBe(true);
    expect(focused).toEqual([12, 11, 16, 14, 16, 11]);
  });

  it('goes on from the field the cursor was in last, as a Next button outside the form does', async () => {
    const { capability, focused } = await form();
    capability.focus(NAME.ref);
    const field = capability.getFieldForWidget(widgetRef(11, P1))!;
    capability.notifyWidgetEvent(field.ref, widgetRef(11, P1), 'blur');
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11, 12]);
  });

  it('takes only the empty fields with `empty`, from a field you name', async () => {
    const { capability, focused, show } = await form();
    show(14, P2);
    // Email has a value: from name, the next empty field is city, on page 2.
    expect(capability.focusNext({ from: NAME.ref, empty: true })).toBe(true);
    expect(focused).toEqual([14]);
  });
});

describe('the field the cursor is in', () => {
  it('moves once from field to field: a blur followed by a focus is one change', async () => {
    const { capability, time } = await form();
    const changes: (string | null)[] = [];
    capability.onFocusChanged(({ field }) => changes.push(field?.name ?? null));
    capability.focus(NAME.ref);
    const name = capability.getFieldForWidget(widgetRef(11, P1))!;
    capability.notifyWidgetEvent(name.ref, widgetRef(11, P1), 'blur');
    capability.focus(EMAIL.ref);
    time.advance(0);
    expect(changes).toEqual(['name', 'email']);
    // Leaving the fields: null, once the turn is over.
    const email = capability.getFieldForWidget(widgetRef(12, P1))!;
    capability.notifyWidgetEvent(email.ref, widgetRef(12, P1), 'blur');
    expect(capability.getFocusedField()?.name).toBe('email');
    time.advance(0);
    expect(capability.getFocusedField()).toBeNull();
    expect(changes).toEqual(['name', 'email', null]);
  });
});

describe('the arrow keys in a radio group', () => {
  it("move to the group's next button, going round, and pick it", async () => {
    const { capability, focused, show, apply } = await form();
    show(15, P2);
    show(16, P2);
    expect(capability.moveInGroup(widgetRef(16, P2), false)).toBe(true);
    expect(focused).toEqual([15]);
    // The value it picks goes to the engine, as a click's does.
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());
    expect(JSON.stringify(apply.mock.calls[0])).toContain('"monthly"');
    expect(capability.moveInGroup(widgetRef(11, P1), false)).toBe(false);
  });
});

describe('a radio button in the form layer', () => {
  it('is named by its option, and comes in its group where the arrow keys bring it', async () => {
    // The field lists yearly first; the page, and so Tab and the arrow keys, monthly first.
    const plan = {
      ...PLAN,
      alternateName: 'Plan',
      widgets: [...PLAN.widgets].reverse(),
    } as FormField;
    const { capability } = await form({
      fields: snapshot.fields.map((field) => (field === PLAN ? plan : field)),
    });
    const buttons = capability
      .listWidgets(P2)
      .flatMap((item) =>
        item.control === 'toggle' && item.kind === 'radio'
          ? [{ label: item.label, inGroup: item.inGroup }]
          : [],
      );
    expect(buttons).toEqual([
      { label: 'Plan: yearly', inGroup: { position: 2, size: 2 } },
      { label: 'Plan: monthly', inGroup: { position: 1, size: 2 } },
    ]);
  });
});

describe('a box that holds nothing to take the cursor', () => {
  // One page: a text box, a signature field, a second text box, in that order.
  const FIRST = text(1, 'first', 11, P1);
  const SIGN = signature(2, 'sign', 18, P1);
  const SECOND = text(3, 'second', 12, P1);
  const page = {
    fields: [FIRST, SIGN, SECOND],
    widgets: [row(11, P1, 100), row(18, P1, 150), row(12, P1, 200)],
    shown: [11, 12],
  };
  // The same, with the signature field and the second text box on page 2, which isn't on screen.
  const LATER_SIGN = signature(2, 'sign', 18, P2);
  const LATER_SECOND = text(3, 'second', 14, P2);
  const pages = {
    fields: [FIRST, LATER_SIGN, LATER_SECOND],
    widgets: [row(11, P1, 100), row(18, P2, 100), row(14, P2, 200)],
    shown: [11],
  };

  it('is passed over by Tab and Shift+Tab: a signature field nothing can sign', async () => {
    const { capability, reveal, focused, showEmpty } = await form(page);
    showEmpty(18, P1);
    capability.focus(FIRST.ref);
    reveal.mockClear();
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11, 12]);
    expect(capability.getFocusedField()?.name).toBe('second');
    // The view went to the second text box, never to the signature field.
    expect(reveal.mock.calls).toEqual([[P1, { rect: { x: 50, y: 200, width: 200, height: 20 } }]]);
    // Past the last field Tab leaves the form; Shift+Tab goes back over the signature field.
    expect(capability.focusNext()).toBe(false);
    expect(capability.focusNext({ backward: true })).toBe(true);
    expect(focused).toEqual([11, 12, 11]);
  });

  it('refuses `focus()`, and leaves the view where it is', async () => {
    const { capability, reveal, focused, showEmpty } = await form(page);
    showEmpty(18, P1);
    expect(capability.focus(SIGN.ref)).toBe(false);
    expect(capability.focus(SIGN.ref, { widget: widgetRef(18, P1) })).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
    expect(focused).toEqual([]);
  });

  it('is not what `focusNext()` starts at, or wraps round to', async () => {
    const { capability, focused, showEmpty } = await form({
      ...page,
      fields: [SIGN, FIRST, SECOND],
      widgets: [row(18, P1, 50), row(11, P1, 100), row(12, P1, 200)],
    });
    showEmpty(18, P1);
    expect(capability.focusNext()).toBe(true);
    expect(capability.focusNext()).toBe(true);
    expect(capability.focusNext({ wrap: true })).toBe(true);
    expect(focused).toEqual([11, 12, 11]);
    expect(capability.focusNext({ empty: true, from: SECOND.ref, wrap: true })).toBe(true);
    expect(focused).toEqual([11, 12, 11, 11]);
  });

  it('is a stop again once it holds something that takes the cursor', async () => {
    const { capability, focused, show, showEmpty } = await form(page);
    const takeBack = showEmpty(18, P1);
    capability.focus(FIRST.ref);
    takeBack();
    // With the signature plugin, the layer's "sign here" button takes the cursor.
    show(18, P1);
    expect(capability.focusNext()).toBe(true);
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11, 18, 12]);
    expect(capability.focus(SIGN.ref)).toBe(true);
    expect(capability.getFocusedField()?.name).toBe('sign');
  });

  it('answers when it is asked, so a control drawn later counts', async () => {
    const { capability, focused, showEmpty } = await form(page);
    let drawn = false;
    showEmpty(18, P1, () => drawn);
    capability.focus(FIRST.ref);
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11, 12]);
    drawn = true;
    // The box says yes now: Shift+Tab stops at it. (The stand-in's `focus` moves nothing.)
    expect(capability.focusNext({ backward: true })).toBe(true);
    expect(focused).toEqual([11, 12]);
  });

  it('a box that is merely off screen is still reached, once its control arrives', async () => {
    const { capability, reveal, focused, show } = await form(pages);
    capability.focus(FIRST.ref);
    expect(capability.focusNext()).toBe(true);
    expect(reveal).toHaveBeenLastCalledWith(P2, {
      rect: { x: 50, y: 100, width: 200, height: 20 },
    });
    expect(focused).toEqual([11]);
    show(18, P2);
    expect(focused).toEqual([11, 18]);
    expect(capability.getFocusedField()?.name).toBe('sign');
  });

  it('a box asked for that comes in with nothing to focus: the cursor goes on past it', async () => {
    const { capability, reveal, focused, show, showEmpty, time } = await form(pages);
    capability.focus(FIRST.ref);
    // Nothing says yet that the signature field can't take the cursor: the view goes to it.
    expect(capability.focusNext()).toBe(true);
    expect(reveal).toHaveBeenLastCalledWith(P2, {
      rect: { x: 50, y: 100, width: 200, height: 20 },
    });
    show(14, P2);
    showEmpty(18, P2);
    expect(focused).toEqual([11]);
    // Once the turn is over and the box still holds nothing, Tab's next stop takes the cursor.
    time.advance(0);
    expect(focused).toEqual([11, 14]);
    expect(reveal).toHaveBeenLastCalledWith(P2, {
      rect: { x: 50, y: 200, width: 200, height: 20 },
    });
    expect(capability.getFocusedField()?.name).toBe('second');
  });

  it('a box asked for whose control is drawn within the turn takes the cursor', async () => {
    const { capability, focused, show, showEmpty, time } = await form(pages);
    capability.focus(FIRST.ref);
    capability.focusNext();
    show(14, P2);
    const takeBack = showEmpty(18, P2);
    takeBack();
    show(18, P2);
    expect(focused).toEqual([11, 18]);
    time.advance(0);
    expect(focused).toEqual([11, 18]);
  });

  it('a box `focus()` asked for that comes in with nothing to focus: the cursor stays', async () => {
    const { capability, focused, show, showEmpty, time } = await form(pages);
    capability.focus(FIRST.ref);
    expect(capability.focus(LATER_SIGN.ref)).toBe(true);
    show(14, P2);
    showEmpty(18, P2);
    time.advance(0);
    expect(focused).toEqual([11]);
    // It is on screen now, and says no.
    expect(capability.focus(LATER_SIGN.ref)).toBe(false);
  });

  it('the cursor going on past it keeps `wrap`, and comes round to the first stop', async () => {
    const { capability, focused, showEmpty, time } = await form({
      fields: [FIRST, SECOND, LATER_SIGN],
      widgets: [row(11, P1, 100), row(12, P1, 200), row(18, P2, 100)],
      shown: [11, 12],
    });
    capability.focus(SECOND.ref);
    expect(capability.focusNext({ wrap: true })).toBe(true);
    showEmpty(18, P2);
    time.advance(0);
    expect(focused).toEqual([12, 11]);
    // Without `wrap` it stops at the end, as Tab does.
    capability.focus(SECOND.ref);
    showEmpty(18, P2)();
    expect(capability.focusNext()).toBe(true);
    showEmpty(18, P2);
    time.advance(0);
    expect(focused).toEqual([12, 11, 12]);
  });

  it('the cursor going on past it never goes round a form of such boxes', async () => {
    // Two signature fields nothing can sign, on two pages, and no other field.
    const HERE = signature(1, 'here', 18, P1);
    const THERE = signature(2, 'there', 19, P2);
    const { capability, reveal, focused, showEmpty, time } = await form({
      fields: [HERE, THERE],
      widgets: [row(18, P1, 100), row(19, P2, 100)],
      shown: [],
    });
    expect(capability.focusNext({ wrap: true })).toBe(true);
    const leave = showEmpty(18, P1);
    time.advance(0);
    // On to the second, whose page comes in as the first one's goes.
    expect(reveal).toHaveBeenLastCalledWith(P2, expect.anything());
    leave();
    showEmpty(19, P2);
    time.advance(0);
    time.advance(0);
    // Each was asked for once: the first isn't asked again, though nothing says now that it can't.
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(focused).toEqual([]);
  });

  it('the cursor goes on from where the stop is, not from the box it chose', async () => {
    // Page 2 in Tab's order: a group's first button, a text box, the group's checked button.
    const { capability, focused, show, showEmpty, time } = await form({
      fields: [NAME, CITY, PLAN],
      widgets: [row(11, P1, 100), row(15, P2, 100), row(14, P2, 200), row(16, P2, 300)],
      shown: [11],
    });
    capability.focus(NAME.ref);
    // The group is the next stop, and its checked button, the last box, is asked for.
    expect(capability.focusNext()).toBe(true);
    show(14, P2);
    showEmpty(15, P2);
    showEmpty(16, P2);
    time.advance(0);
    expect(focused).toEqual([11, 14]);
  });

  it('a control lent while the Stage brings its box in takes the cursor', async () => {
    const { capability, reveal, focused, show } = await form();
    // A host that draws the page as the view moves.
    reveal.mockImplementationOnce(() => void show(14, P2));
    expect(capability.focus(CITY.ref)).toBe(true);
    expect(focused).toEqual([14]);
    expect(capability.getFocusedField()?.name).toBe('city');
  });

  it('a box lent while the Stage brings it in, with nothing to focus: the cursor goes on', async () => {
    const { capability, reveal, focused, show, showEmpty, time } = await form(pages);
    show(14, P2);
    capability.focus(FIRST.ref);
    reveal.mockImplementationOnce(() => void showEmpty(18, P2));
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11]);
    time.advance(0);
    expect(focused).toEqual([11, 14]);
  });

  it('a control that says it takes the cursor and then takes none is passed over', async () => {
    const { capability, focused } = await form(page);
    // Nothing in the box took the cursor when asked: its target answers `false`.
    const asked = vi.fn(() => false);
    capability.attachFocusTarget(widgetRef(18, P1), { focus: asked });
    capability.focus(FIRST.ref);
    expect(capability.focusNext()).toBe(true);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(focused).toEqual([11, 12]);
    expect(capability.focus(SIGN.ref)).toBe(false);
  });

  it('a target whose `focus` returns something of its own takes the cursor', async () => {
    const { capability, focused } = await form(page);
    // Only `false` says nothing took it: a host's `focus` may return a timer, or a promise.
    const timer: FormFocusTarget = { focus: () => 7 };
    const promise: FormFocusTarget = { focus: async () => {} };
    capability.attachFocusTarget(widgetRef(18, P1), timer);
    capability.focus(FIRST.ref);
    expect(capability.focus(SIGN.ref)).toBe(true);
    capability.attachFocusTarget(widgetRef(18, P1), promise);
    expect(capability.focus(SIGN.ref)).toBe(true);
    // Tab stops at it too: the cursor doesn't go on to the box after it.
    capability.focus(FIRST.ref);
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11, 11]);
  });

  it('asks only the stops it comes to', async () => {
    // A text box, then forty radio groups: Tab from the text box needs the first group alone.
    const fields: FormField[] = [FIRST];
    const widgets = [row(11, P1, 1)];
    for (let group = 0; group < 40; group++) {
      const button = 100 + group * 2;
      fields.push({
        ...PLAN,
        ref: fieldRef(500 + group),
        name: `plan${group}`,
        widgets: [
          { ...formWidget(button, P1), onState: 'a', exportValue: 'a', checked: true },
          { ...formWidget(button + 1, P1), onState: 'b', exportValue: 'b', checked: false },
        ],
      } as unknown as FormField);
      widgets.push(row(button, P1, 10 + group * 2), row(button + 1, P1, 11 + group * 2));
    }
    const { capability } = await form({ fields, widgets, shown: [11] });
    const asked: number[] = [];
    for (let group = 0; group < 40; group++) {
      const button = 100 + group * 2;
      capability.attachFocusTarget(widgetRef(button, P1), {
        takesCursor: () => {
          asked.push(button);
          return true;
        },
        focus: () => {},
      });
    }
    capability.focus(FIRST.ref);
    expect(capability.focusNext()).toBe(true);
    expect(new Set(asked)).toEqual(new Set([100]));
  });
});

/** A radio group `name` whose buttons are `buttons`, in the order the field lists them. */
const radio = (
  field: number,
  name: string,
  buttons: readonly { widget: number; page: typeof P1; value: string; checked?: boolean }[],
) => {
  const value = buttons.find((button) => button.checked)?.value ?? 'Off';
  return {
    ...base,
    ref: fieldRef(field),
    name,
    kind: 'radio',
    value,
    radiosInUnison: false,
    noToggleToOff: false,
    valueEntry: { kind: 'scalar', value },
    defaultValueEntry: { kind: 'scalar', value: 'Off' },
    widgets: buttons.map((button) => ({
      ...formWidget(button.widget, button.page),
      onState: button.value,
      exportValue: button.value,
      checked: button.checked ?? false,
    })),
  } as unknown as FormField;
};

/** Press Tab (or Shift+Tab) until it leaves the form, at most `most` times: the boxes it went to. */
const presses = (
  { capability, focused }: Awaited<ReturnType<typeof form>>,
  options: { backward?: boolean; empty?: boolean; wrap?: boolean } = {},
  most = 8,
): number[] => {
  const start = focused.length;
  for (let press = 0; press < most; press++) if (!capability.focusNext(options)) break;
  return focused.slice(start);
};

describe("a field between a radio group's buttons in Tab's order", () => {
  // One page, in Tab's order: a text box, the group's first button, a text box, the group's
  // checked button, a last text box. Every control is on screen.
  const BEFORE = text(1, 'before', 11, P1, 'filled');
  const BETWEEN = text(2, 'between', 14, P1);
  const AFTER = text(3, 'after', 19, P1);
  const CHOICE = radio(5, 'choice', [
    { widget: 15, page: P1, value: 'first' },
    { widget: 16, page: P1, value: 'second', checked: true },
  ]);
  const UNCHECKED = radio(5, 'choice', [
    { widget: 15, page: P1, value: 'first' },
    { widget: 16, page: P1, value: 'second' },
  ]);
  const widgets = [
    row(11, P1, 100),
    row(15, P1, 150),
    row(14, P1, 200),
    row(16, P1, 250),
    row(19, P1, 300),
  ];
  const page = { fields: [BEFORE, CHOICE, BETWEEN, AFTER], widgets, shown: [11, 15, 14, 16, 19] };

  it('is where Tab goes from the group, and is reached once', async () => {
    const harness = await form(page);
    harness.capability.focus(BEFORE.ref);
    // The group is one stop, where its first button is; its checked button takes the cursor.
    // From there Tab goes on to what comes after the group's stop: the field between.
    expect(presses(harness)).toEqual([16, 14, 19]);
    expect(harness.capability.focusNext()).toBe(false);
  });

  it('is passed once by Shift+Tab, which then leaves the group for the field before it', async () => {
    const harness = await form(page);
    harness.capability.focus(AFTER.ref);
    expect(presses(harness, { backward: true })).toEqual([14, 16, 11]);
    expect(harness.capability.focusNext({ backward: true })).toBe(false);
  });

  it('with nothing checked: Shift+Tab comes to the last button, and goes on before the group', async () => {
    const harness = await form({ ...page, fields: [BEFORE, UNCHECKED, BETWEEN, AFTER] });
    harness.capability.focus(AFTER.ref);
    expect(presses(harness, { backward: true })).toEqual([14, 16, 11]);
    // Forward the first button takes the cursor, which is where the stop is.
    expect(presses(harness)).toEqual([15, 14, 19]);
  });

  it('counts for `empty` from a button of the group', async () => {
    const harness = await form(page);
    harness.capability.focus(CHOICE.ref);
    expect(harness.focused).toEqual([16]);
    // The group has a value, the field before it too: the empty fields are the two text boxes.
    expect(presses(harness, { empty: true })).toEqual([14, 19]);
    harness.capability.focus(CHOICE.ref);
    expect(presses(harness, { empty: true, backward: true })).toEqual([]);
  });

  it('with `wrap`, each stop comes once in a round, either way', async () => {
    // The group is the first stop: its first button, the text box, its checked button, a text box.
    const harness = await form({
      fields: [CHOICE, BETWEEN, AFTER],
      widgets: widgets.slice(1),
      shown: [15, 14, 16, 19],
    });
    harness.capability.focus(CHOICE.ref);
    expect(presses(harness, { wrap: true }, 6)).toEqual([14, 19, 16, 14, 19, 16]);
    expect(presses(harness, { wrap: true, backward: true }, 6)).toEqual([19, 14, 16, 19, 14, 16]);
  });

  it('is next from the group when the field is named, whichever button the field lists first', async () => {
    // The field lists its checked button first; the page, and so Tab, the other one.
    const listed = { ...CHOICE, widgets: [...CHOICE.widgets].reverse() } as FormField;
    const { capability, focused } = await form({
      ...page,
      fields: [BEFORE, listed, BETWEEN, AFTER],
    });
    expect(capability.focusNext({ from: listed.ref })).toBe(true);
    expect(capability.focusNext({ from: listed.ref, backward: true })).toBe(true);
    expect(focused).toEqual([14, 11]);
  });

  it('is reached past a second group whose buttons lie among the first one’s', async () => {
    // In Tab's order: A's first button, B's first, A's checked, B's checked.
    const A = radio(5, 'a', [
      { widget: 15, page: P1, value: 'first' },
      { widget: 16, page: P1, value: 'second', checked: true },
    ]);
    const B = radio(6, 'b', [
      { widget: 17, page: P1, value: 'first' },
      { widget: 18, page: P1, value: 'second', checked: true },
    ]);
    const harness = await form({
      fields: [BEFORE, A, B, AFTER],
      widgets: [
        row(11, P1, 100),
        row(15, P1, 150),
        row(17, P1, 200),
        row(16, P1, 250),
        row(18, P1, 300),
        row(19, P1, 350),
      ],
      shown: [11, 15, 16, 17, 18, 19],
    });
    harness.capability.focus(BEFORE.ref);
    expect(presses(harness)).toEqual([16, 18, 19]);
    expect(presses(harness, { backward: true })).toEqual([18, 16, 11]);
  });

  it('on each page the group shows on: the group is one stop there, where its first button is', async () => {
    // Page 1: a text box, a button, a text box, the checked button. Page 2: a button, a text
    // box, a button, a last text box.
    const SECOND = text(4, 'second', 24, P2);
    const LAST = text(6, 'last', 29, P2);
    const SPREAD = radio(5, 'spread', [
      { widget: 15, page: P1, value: 'a' },
      { widget: 16, page: P1, value: 'b', checked: true },
      { widget: 21, page: P2, value: 'c' },
      { widget: 22, page: P2, value: 'd' },
    ]);
    const harness = await form({
      fields: [BEFORE, SPREAD, BETWEEN, SECOND, LAST],
      widgets: [
        row(11, P1, 100),
        row(15, P1, 150),
        row(14, P1, 200),
        row(16, P1, 250),
        row(21, P2, 100),
        row(24, P2, 150),
        row(22, P2, 200),
        row(29, P2, 250),
      ],
      shown: [11, 15, 14, 16],
    });
    for (const box of [21, 24, 22, 29]) harness.show(box, P2);
    harness.capability.focus(BEFORE.ref);
    // Page 1's stop takes the cursor at the checked button; page 2 has none checked, so its first.
    expect(presses(harness)).toEqual([16, 14, 21, 24, 29]);
    // Backward page 2's stop takes it at its last button, and page 1's at the checked one.
    expect(presses(harness, { backward: true })).toEqual([24, 22, 14, 16, 11]);
  });

  it("is never where the arrow keys go: they move between the group's buttons, as before", async () => {
    const { capability, focused, apply } = await form(page);
    expect(capability.moveInGroup(widgetRef(16, P1), false)).toBe(true);
    expect(capability.moveInGroup(widgetRef(15, P1), false)).toBe(true);
    expect(capability.moveInGroup(widgetRef(16, P1), true)).toBe(true);
    expect(capability.moveInGroup(widgetRef(15, P1), true)).toBe(true);
    expect(focused).toEqual([15, 16, 15, 16]);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(4));
    expect(capability.moveInGroup(widgetRef(14, P1), false)).toBe(false);
  });

  it('from a button that shows nowhere, Tab starts at the start of the form, as before', async () => {
    // The group's first button has no size, so it has no place in Tab's order; the cursor was
    // in it last.
    const { capability, focused } = await form({
      ...page,
      widgets: widgets.map((box) =>
        box === widgets[1]
          ? ({ ...box, rect: { x: 0, y: 792, width: 0, height: 0 } } as WidgetAnnotation)
          : box,
      ),
      shown: [11, 14, 16, 19],
    });
    capability.notifyWidgetEvent(CHOICE.ref, widgetRef(15, P1), 'focus');
    expect(capability.focusNext()).toBe(true);
    expect(focused).toEqual([11]);
  });

  it('is where Tab goes after an arrow key moved the cursor to another button', async () => {
    // A third button after the text box: first button, checked button, the text box, third.
    const THREE = radio(5, 'choice', [
      { widget: 15, page: P1, value: 'first' },
      { widget: 16, page: P1, value: 'second', checked: true },
      { widget: 17, page: P1, value: 'third' },
    ]);
    const harness = await form({
      fields: [BEFORE, THREE, BETWEEN, AFTER],
      widgets: [
        row(11, P1, 100),
        row(15, P1, 150),
        row(16, P1, 200),
        row(14, P1, 250),
        row(17, P1, 300),
        row(19, P1, 350),
      ],
      shown: [11, 15, 16, 14, 17, 19],
    });
    harness.capability.focus(THREE.ref);
    expect(harness.capability.moveInGroup(widgetRef(16, P1), false)).toBe(true);
    expect(harness.focused).toEqual([16, 17]);
    expect(presses(harness)).toEqual([14, 19]);
    harness.capability.focus(THREE.ref, { widget: widgetRef(17, P1) });
    expect(presses(harness, { backward: true })).toEqual([11]);
  });
});

describe("a radio group whose buttons come one after the other in Tab's order", () => {
  // One page: a text box, the group's two buttons, a text box.
  const BEFORE = text(1, 'before', 11, P1, 'filled');
  const AFTER = text(3, 'after', 19, P1);
  const buttons = (checked: 'first' | 'second' | null, page = P1) =>
    radio(5, 'choice', [
      { widget: 15, page, value: 'first', checked: checked === 'first' },
      { widget: 16, page, value: 'second', checked: checked === 'second' },
    ]);
  const widgets = [row(11, P1, 100), row(15, P1, 150), row(16, P1, 200), row(19, P1, 250)];
  const page = (checked: 'first' | 'second' | null) => ({
    fields: [BEFORE, buttons(checked), AFTER],
    widgets,
    shown: [11, 15, 16, 19],
  });

  it('is one stop either way, at its checked button', async () => {
    for (const [checked, box] of [
      ['first', 15],
      ['second', 16],
    ] as const) {
      const harness = await form(page(checked));
      harness.capability.focus(BEFORE.ref);
      expect(presses(harness)).toEqual([box, 19]);
      expect(presses(harness, { backward: true })).toEqual([box, 11]);
    }
  });

  it('with nothing checked, takes the cursor at its first button, or its last from after it', async () => {
    const harness = await form(page(null));
    harness.capability.focus(BEFORE.ref);
    expect(presses(harness)).toEqual([15, 19]);
    expect(presses(harness, { backward: true })).toEqual([16, 11]);
  });

  it('with `empty`, is a stop only while nothing is checked', async () => {
    const empty = await form(page(null));
    expect(presses(empty, { empty: true })).toEqual([15, 19]);
    expect(presses(empty, { empty: true, backward: true })).toEqual([16]);
    const chosen = await form(page('second'));
    expect(presses(chosen, { empty: true })).toEqual([19]);
    // From the group itself, which has a value: on to the next empty field.
    chosen.capability.focus(buttons('second').ref);
    expect(presses(chosen, { empty: true })).toEqual([19]);
    chosen.capability.focus(buttons('second').ref);
    expect(presses(chosen, { empty: true, backward: true })).toEqual([]);
  });

  it('with `wrap`, comes once in a round, either way', async () => {
    const harness = await form(page('second'));
    harness.capability.focus(BEFORE.ref);
    expect(presses(harness, { wrap: true }, 6)).toEqual([16, 19, 11, 16, 19, 11]);
    expect(presses(harness, { wrap: true, backward: true }, 6)).toEqual([19, 16, 11, 19, 16, 11]);
  });

  it('is one stop on each page it shows on', async () => {
    const LAST = text(6, 'last', 29, P2);
    const SPREAD = radio(5, 'spread', [
      { widget: 15, page: P1, value: 'a' },
      { widget: 16, page: P1, value: 'b', checked: true },
      { widget: 21, page: P2, value: 'c' },
      { widget: 22, page: P2, value: 'd' },
    ]);
    const harness = await form({
      fields: [BEFORE, SPREAD, LAST],
      widgets: [
        row(11, P1, 100),
        row(15, P1, 150),
        row(16, P1, 200),
        row(21, P2, 100),
        row(22, P2, 150),
        row(29, P2, 200),
      ],
      shown: [11, 15, 16],
    });
    for (const box of [21, 22, 29]) harness.show(box, P2);
    harness.capability.focus(BEFORE.ref);
    expect(presses(harness)).toEqual([16, 21, 29]);
    expect(presses(harness, { backward: true })).toEqual([22, 16, 11]);
  });

  it('takes the arrow keys through its buttons on every page, going round', async () => {
    const SPREAD = radio(5, 'spread', [
      { widget: 15, page: P1, value: 'a' },
      { widget: 16, page: P1, value: 'b', checked: true },
      { widget: 21, page: P2, value: 'c' },
    ]);
    const { capability, focused, show, apply } = await form({
      fields: [BEFORE, SPREAD],
      widgets: [row(11, P1, 100), row(15, P1, 150), row(16, P1, 200), row(21, P2, 100)],
      shown: [11, 15, 16],
    });
    show(21, P2);
    expect(capability.moveInGroup(widgetRef(16, P1), false)).toBe(true);
    expect(capability.moveInGroup(widgetRef(21, P2), false)).toBe(true);
    expect(capability.moveInGroup(widgetRef(15, P1), true)).toBe(true);
    expect(focused).toEqual([21, 15, 21]);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(3));
    expect(apply.mock.calls.map((call) => JSON.stringify(call)).join()).toMatch(/"c".*"a".*"c"/);
  });
});
