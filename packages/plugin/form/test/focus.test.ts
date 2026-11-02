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
  type FormFieldDTO,
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
    family: 'text',
    valueEntry: { kind: 'scalar', value },
    defaultValueEntry: { kind: 'scalar', value: '' },
    widgets: [formWidget(widget, page)],
    value,
    defaultValue: '',
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
  }) as unknown as FormFieldDTO;

const NAME = text(1, 'name', 11, P1);
const EMAIL = text(2, 'email', 12, P1, 'ada@example.com');
const LOCKED = { ...text(3, 'id', 13, P1), readOnly: true } as FormFieldDTO;
const CITY = text(4, 'city', 14, P2);
const PLAN = {
  ...base,
  ref: fieldRef(5),
  name: 'plan',
  family: 'radio',
  value: 'yearly',
  radiosInUnison: false,
  noToggleToOff: false,
  valueEntry: { kind: 'scalar', value: 'yearly' },
  defaultValueEntry: { kind: 'scalar', value: 'Off' },
  widgets: [
    { ...formWidget(15, P2), onState: 'monthly', exportValue: 'monthly', checked: false },
    { ...formWidget(16, P2), onState: 'yearly', exportValue: 'yearly', checked: true },
  ],
} as unknown as FormFieldDTO;

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
  ],
  fields: [NAME, EMAIL, LOCKED, CITY, PLAN],
  calculationOrder: [],
};

const widgetRef = (objectNumber: number, page: typeof P1): AnnotationRef =>
  ({ kind: 'objectNumber', page, objectNumber }) as AnnotationRef;

async function form({
  stage = true,
  tabs = 'rows' as 'rows' | 'structure',
}: { stage?: boolean; tabs?: 'rows' | 'structure' } = {}) {
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
      forms: { list: vi.fn(async () => snapshot), create: vi.fn() },
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
  show(11, P1);
  show(12, P1);
  show(13, P1);
  return { capability, reveal, focused, selected, show, time, apply };
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
