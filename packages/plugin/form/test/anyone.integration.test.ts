/**
 * Fields anyone fills in (`assignment` `{ kind: 'anyone' }`), on a real engine: every signer
 * fills one in and sees it in Anyone's tint, read as "Anyone" after its name; a field a signature
 * locked shows plain; `prefill()` leaves one alone; a tool places one, its ghost tinted the same,
 * while the signature tool places nothing; `assign()` and its shorthand `moveToGroup()` give
 * fields an assignment as one step to undo; and a field's settings offer the assignments the
 * user may give.
 */
import { createKernel, timerClock, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import {
  ANYONE_FIELDS_PDF,
  ANYONE_FIELD_TOKENS,
  CHANGE_FIXTURE_PDF,
} from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  type AnnotationRef,
  type Change,
  type ChangeOp,
  type FormField,
  type FormFieldRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { i18nPlugin } from '@embedpdf/plugin-i18n';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FormConfig, FormDesignGroupChangedEvent } from '../src/contract';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

const ref = (name: string): FormFieldRef => ({ kind: 'fqn', name });

/** A signature's bytes: the engine stores them and judges nothing by them. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

type Token = (typeof ANYONE_FIELD_TOKENS)[keyof typeof ANYONE_FIELD_TOKENS];

/** The engine, with every change this session sends written down before it goes on. */
function recording(
  inner: Engine,
  sent: ChangeOp[][],
  opened: (doc: DocumentHandle) => void,
): Engine {
  const record = (doc: DocumentHandle): DocumentHandle =>
    new Proxy(doc, {
      get(target, prop) {
        if (prop === 'apply') {
          return (change: Change, options: unknown) => {
            if ('ops' in change) sent.push([...change.ops]);
            return target.apply(change, options as never);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === 'with' && typeof value === 'function') {
          return (...args: unknown[]) => record(value.apply(target, args) as DocumentHandle);
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'open') {
        return async (...args: Parameters<Engine['open']>) => {
          const doc = await target.open(...args);
          opened(doc);
          return record(doc);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

interface BootOptions {
  readonly token?: Token;
  readonly config?: FormConfig;
  /** The viewer's language, with the i18n plugin; without it, there is no i18n plugin. */
  readonly locale?: string;
}

async function boot(bytes: Uint8Array, options: BootOptions = {}) {
  const sent: ChangeOp[][] = [];
  let inner: DocumentHandle | null = null;
  const token = options.token ?? ANYONE_FIELD_TOKENS.everything;
  const kernel = createKernel({
    clock: { ...timerClock, today: () => ({ year: 2026, month: 11, day: 27 }) },
    engine: recording(engine, sent, (doc) => (inner = doc)),
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      annotationPlugin(),
      formPlugin(options.config ?? {}),
      historyPlugin(),
      ...(options.locale
        ? [
            i18nPlugin({
              locale: options.locale,
              locales: [
                { code: 'en', name: 'English', translations: {} },
                { code: 'nl', name: 'Nederlands', translations: {} },
              ],
            }),
          ]
        : []),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: `anyone-${Math.random()}`, bytes }, {
    scope: [...token.scope, 'doc.forms.read'],
    identity: token.identity,
  } as never);
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  await annotation.whenSynced();
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const page = (await doc.pages.list()).pages[0]!.ref as PageRef;
  await form.ensureLoaded(page);
  const widgetOf = (field: FormField): AnnotationRef => {
    const widget = field.widgets[0]!;
    return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
  };
  const pointer = (phase: 'move' | 'down' | 'up', point: { x: number; y: number }) =>
    interaction.dispatchPointer({
      phase,
      viewport: { x: 0, y: 0 },
      page: { ref: page, point },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    });
  /** A field tool's ghost where the pointer is, or `undefined` for none. */
  const ghostAt = (tool: string, point: { x: number; y: number }) => {
    interaction.activateTool(tool);
    pointer('move', point);
    return annotation.listPageItems(page).find((item) => item.source === 'ghost');
  };
  /** A click on the page with a field tool, and the field it placed once the engine answered. */
  const place = async (tool: string, point: { x: number; y: number }): Promise<FormField> => {
    const before = new Set(form.list().map((field) => field.name));
    interaction.activateTool(tool);
    pointer('down', point);
    pointer('up', point);
    let placed: FormField | undefined;
    await vi.waitFor(async () => {
      placed = (await doc.forms.list()).fields.find((field) => !before.has(field.name));
      expect(placed).toBeDefined();
    });
    await vi.waitFor(() => expect(form.get(placed!.ref)).not.toBeNull());
    return form.get(placed!.ref)!;
  };
  /** One step back once the engine answered. */
  const undo = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const offDone = history.onUndone(() => {
        offDone();
        offFailed();
        resolve();
      });
      const offFailed = history.onUndoFailed((event) => {
        offDone();
        offFailed();
        reject(new Error(`undo failed: ${JSON.stringify(event)}`));
      });
      history.undo();
    });
  /** The box of a field as the form layer draws it. */
  const boxOf = (name: string) =>
    form.listWidgets(page).find((item) => form.get(item.fieldRef)?.name === name);
  return {
    kernel,
    form,
    annotation,
    interaction,
    page,
    sent,
    widgetOf,
    pointer,
    ghostAt,
    place,
    undo,
    boxOf,
    destroy: () => kernel.destroy(),
  };
}

/** What a call rejects with: its code and, for a refusal, the permission it names. */
const refusalOf = (attempt: Promise<unknown>) =>
  attempt.then(
    () => 'resolved',
    (error: { code?: string; permission?: string }) =>
      error.permission ? { code: error.code, permission: error.permission } : error.code,
  );

/**
 * The Anyone fixture after `token` fills in `values` and signs `field` with no lock of its own:
 * the signing locks the signer's group and every field anyone fills in that holds a value.
 */
async function signedBy(
  token: Token,
  values: Readonly<Record<string, string>>,
  field: string,
  bytes: Uint8Array = ANYONE_FIELDS_PDF.slice(),
): Promise<Uint8Array> {
  const doc = await engine.open({ kind: 'bytes', id: `signing-${Math.random()}`, bytes }, {
    scope: [...token.scope],
    identity: token.identity,
  } as never);
  for (const [name, value] of Object.entries(values)) {
    await doc.forms.setValue(ref(name), { value });
  }
  const prepared = await doc.signatures.prepare({ field: ref(field) });
  await doc.signatures.complete({
    signingId: prepared.signingId,
    cms: PLACEHOLDER_CMS,
    expectedVersion: prepared.expectedVersion,
  });
  const signed = await doc.download();
  await doc.close();
  return signed;
}

const CYAN = '#0891b2';

describe('a field anyone fills in, while filling', () => {
  it('is every signer’s to fill in, in Anyone’s tint, read as "Anyone" after its name', async () => {
    const dana = await boot(ANYONE_FIELDS_PDF.slice(), { token: ANYONE_FIELD_TOKENS.dana });
    try {
      const { form } = dana;
      // The engine's answer: a `fields:fill` for Dana's group reaches a field anyone fills in.
      expect(form.canFill(ref('reference'))).toBe(true);
      expect(form.canFill(ref('ada_name'))).toBe(false);
      expect(form.canFill(ref('sender_note'))).toBe(false);
      expect(dana.boxOf('reference')).toMatchObject({
        yours: true,
        disabled: false,
        accent: { color: CYAN, strength: 0.16, anyone: true },
        label: 'reference, Anyone',
      });
      await form.setValue(ref('reference'), { value: 'PO-7' });
      expect(form.getValue(ref('reference'))).toEqual({ value: 'PO-7' });
      // Someone else's field and the sender's look as in the PDF.
      for (const name of ['ada_name', 'sender_note']) {
        expect(dana.boxOf(name)).toMatchObject({ yours: false, accent: null });
      }
      // `null` gives it the base tint; with none, no tint at all.
      form.updateSettings({ fields: { anyoneTintColor: null, tintColor: '#0ea5e9' } });
      expect(dana.boxOf('reference')!.accent).toEqual({
        color: '#0ea5e9',
        strength: 0.16,
        base: true,
      });
      form.updateSettings({ fields: { tintColor: null } });
      expect(dana.boxOf('reference')!.accent).toBeNull();
    } finally {
      await dana.destroy();
    }
  });

  it('reads "Anyone" in the viewer’s language', async () => {
    const dana = await boot(ANYONE_FIELDS_PDF.slice(), {
      token: ANYONE_FIELD_TOKENS.dana,
      locale: 'nl',
    });
    try {
      expect(dana.boxOf('reference')!.label).toBe('reference, Iedereen');
    } finally {
      await dana.destroy();
    }
  });

  it('is refused to a session that fills in no field, naming the broad permission', async () => {
    const reader = await boot(ANYONE_FIELDS_PDF.slice(), { token: ANYONE_FIELD_TOKENS.reader });
    try {
      expect(reader.form.canFill(ref('reference'))).toBe(false);
      expect(reader.boxOf('reference')).toMatchObject({ yours: false, accent: null });
      expect(await refusalOf(reader.form.setValue(ref('reference'), { value: 'x' }))).toEqual({
        code: 'permission-denied',
        permission: 'doc.forms.fill',
      });
    } finally {
      await reader.destroy();
    }
  });

  it('shows plain once a signature locked it, the signer’s own fields included', async () => {
    const bytes = await signedBy(
      ANYONE_FIELD_TOKENS.dana,
      { dana_name: 'Dana Smith', reference: 'PO-7' },
      'dana_sig',
    );
    for (const token of [ANYONE_FIELD_TOKENS.dana, ANYONE_FIELD_TOKENS.ada]) {
      const signer = await boot(bytes, { token });
      try {
        // The signing locked what Dana filled in: read-only, so no one's to fill in now.
        expect(signer.form.get(ref('reference'))!.readOnly).toBe(true);
        expect(signer.boxOf('reference')).toMatchObject({ yours: false, accent: null });
        // The empty one stays open for the next signer.
        expect(signer.boxOf('notes')).toMatchObject({
          yours: true,
          accent: { color: CYAN, anyone: true },
        });
      } finally {
        await signer.destroy();
      }
    }
    const dana = await boot(bytes, { token: ANYONE_FIELD_TOKENS.dana });
    try {
      expect(dana.boxOf('dana_name')).toMatchObject({ yours: false, accent: null });
    } finally {
      await dana.destroy();
    }
  });

  it('is not yours while the `fillable` setting leaves it out', async () => {
    const dana = await boot(ANYONE_FIELDS_PDF.slice(), {
      token: ANYONE_FIELD_TOKENS.dana,
      config: { fillable: ['signature'] },
    });
    try {
      expect(dana.boxOf('reference')).toMatchObject({
        canFill: true,
        disabled: true,
        yours: false,
        accent: null,
      });
      // Dana's own text field too: the setting takes the tint and the placeholder away.
      expect(dana.boxOf('dana_name')).toMatchObject({ yours: false, accent: null });
      dana.form.updateSettings({ fillable: true });
      expect(dana.boxOf('reference')).toMatchObject({ yours: true, disabled: false });
    } finally {
      await dana.destroy();
    }
  });

  it('prefill() leaves it alone, with a reason of its own', async () => {
    const author = await engine.open(
      { kind: 'bytes', id: `author-${Math.random()}`, bytes: CHANGE_FIXTURE_PDF.slice() },
      { scope: ['*'] },
    );
    const page = (await author.pages.list()).pages[0]!.ref;
    await author.forms.create({
      kind: 'text',
      name: 'anyone_name',
      purpose: 'name',
      assignment: { kind: 'anyone' },
      widgets: [{ page, rect: { x: 40, y: 40, width: 160, height: 24 } }],
    });
    await author.forms.create({
      kind: 'text',
      name: 'own_name',
      purpose: 'name',
      widgets: [{ page, rect: { x: 40, y: 80, width: 160, height: 24 } }],
    });
    const bytes = await author.download();
    await author.close();
    const signer = await boot(bytes, {
      token: {
        scope: ['doc.open', 'doc.render', 'doc.forms.fill'],
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
      } as unknown as Token,
    });
    try {
      const { form } = signer;
      const result = await form.prefill();
      expect(result.applied).toEqual([form.get(ref('own_name'))!.ref]);
      expect(result.skipped).toContainEqual({
        ref: form.get(ref('anyone_name'))!.ref,
        reason: 'for-anyone',
      });
      expect(form.getValue(ref('anyone_name'))).toBeNull();
    } finally {
      await signer.destroy();
    }
  });
});

describe('placing and moving fields for anyone', () => {
  const GROUP_DANA = { kind: 'group', groupId: 'dana' } as const;
  const ANYONE = { kind: 'anyone' } as const;
  const UNASSIGNED = { kind: 'unassigned' } as const;

  it('one design assignment at a time, said by the event and the state; refused without the right', async () => {
    const sender = await boot(ANYONE_FIELDS_PDF.slice(), { token: ANYONE_FIELD_TOKENS.sender });
    const designer = await boot(ANYONE_FIELDS_PDF.slice(), {
      token: ANYONE_FIELD_TOKENS.designer,
    });
    try {
      const { form } = sender;
      const events: FormDesignGroupChangedEvent[] = [];
      form.onDesignGroupChanged((event) => events.push(event));
      expect(form.canAssign(ANYONE)).toBe(true);
      expect(form.getDesignAssignment()).toEqual(UNASSIGNED);
      // The released shorthand: a group's id.
      form.setDesignGroup('dana');
      expect(form.getDesignAssignment()).toEqual(GROUP_DANA);
      form.setDesignAssignment(ANYONE);
      expect(form.getDesignGroup()).toBeNull();
      expect(form.getDesignAssignment()).toEqual(ANYONE);
      // The same assignment again changes nothing.
      form.setDesignAssignment({ kind: 'anyone' });
      form.setDesignGroup('ada');
      form.setDesignAssignment(ANYONE);
      form.setDesignGroup(null);
      expect(form.getDesignAssignment()).toEqual(UNASSIGNED);
      expect(events).toEqual([
        { groupId: 'dana', assignment: GROUP_DANA },
        { groupId: null, assignment: ANYONE },
        { groupId: 'ada', assignment: { kind: 'group', groupId: 'ada' } },
        { groupId: null, assignment: ANYONE },
        { groupId: null, assignment: UNASSIGNED },
      ]);

      // Designing for Dana's group alone isn't putting fields in every group.
      expect(designer.form.canDesign()).toBe(true);
      expect(designer.form.canAssign(ANYONE)).toBe(false);
      expect(designer.form.canAssign(GROUP_DANA)).toBe(true);
      expect(designer.form.canAssign({ kind: 'group', groupId: 'ada' })).toBe(false);
      expect(designer.form.canAssign(UNASSIGNED)).toBe(true);
      expect(() => designer.form.setDesignAssignment(ANYONE)).toThrow(
        expect.objectContaining({ code: 'permission-denied', permission: 'fields:set-group:all' }),
      );
      expect(designer.form.getDesignAssignment()).toEqual(UNASSIGNED);
      // Nobody's takes no right of its own.
      designer.form.setDesignAssignment(UNASSIGNED);
    } finally {
      await sender.destroy();
      await designer.destroy();
    }
  });

  it('a tool places a field for anyone, its ghost in the same tint; the signature tool places nothing', async () => {
    const sender = await boot(CHANGE_FIXTURE_PDF.slice());
    try {
      const { form, annotation, page } = sender;
      form.setDesignAssignment(ANYONE);
      const point = { x: 120, y: 300 };
      const ghost = sender.ghostAt('form-name', point)!;
      expect(ghost).toMatchObject({
        accent: { color: CYAN, strength: 0.16, anyone: true },
        ghostOpacity: 0.5,
      });
      const placed = await sender.place('form-name', point);
      expect(placed).toMatchObject({ groupId: null, assignment: ANYONE, purpose: 'name' });
      const item = annotation
        .listPageItems(page)
        .find((each) => each.id === annotationKey(sender.widgetOf(placed)))!;
      expect(item.accent).toEqual(ghost.accent);

      // One signer signs a signature field: no ghost, and a click places nothing.
      const count = form.list().length;
      expect(sender.ghostAt('form-signature', { x: 120, y: 500 })).toBeUndefined();
      sender.pointer('down', { x: 120, y: 500 });
      sender.pointer('up', { x: 120, y: 500 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(form.list()).toHaveLength(count);
      // For nobody, it places again.
      form.setDesignGroup(null);
      expect(sender.ghostAt('form-signature', { x: 120, y: 500 })).toBeDefined();
    } finally {
      await sender.destroy();
    }
  });

  it('assign() is one step to undo, and its shorthand moveToGroup() takes anyone away', async () => {
    const sender = await boot(ANYONE_FIELDS_PDF.slice(), { token: ANYONE_FIELD_TOKENS.sender });
    try {
      const { form, sent } = sender;
      const whose = (field: FormField) => ({
        name: field.name,
        groupId: field.groupId,
        assignment: field.assignment,
      });
      const { fields } = await form.assign([ref('dana_name'), ref('sender_note')], ANYONE);
      expect(fields.map(whose)).toEqual([
        { name: 'dana_name', groupId: null, assignment: ANYONE },
        { name: 'sender_note', groupId: null, assignment: ANYONE },
      ]);
      // One change: one op per field, each the assignment.
      expect(sent.at(-1)!.map((op) => (op as { patch?: unknown }).patch)).toEqual([
        { assignment: ANYONE },
        { assignment: ANYONE },
      ]);
      await sender.undo();
      expect(whose(form.get(ref('dana_name'))!)).toMatchObject({ assignment: GROUP_DANA });
      expect(whose(form.get(ref('sender_note'))!)).toMatchObject({ assignment: UNASSIGNED });

      await form.moveToGroup([ref('reference')], 'ada');
      // A group goes as 3.4 sent it, in the released member, from any assignment.
      expect((sent.at(-1)![0] as { patch?: unknown }).patch).toEqual({ groupId: 'ada' });
      expect(whose(form.get(ref('reference'))!)).toMatchObject({
        groupId: 'ada',
        assignment: { kind: 'group', groupId: 'ada' },
      });
      await form.moveToGroup([ref('notes')], null);
      expect(whose(form.get(ref('notes'))!)).toMatchObject({
        groupId: null,
        assignment: UNASSIGNED,
      });
      // A field of nobody's given to nobody again: nothing to send.
      const before = sent.length;
      await form.moveToGroup([ref('sender_note')], null);
      expect(sent).toHaveLength(before);

      // A signature field is one signer's: refused, and nothing moves.
      expect(await refusalOf(form.assign([ref('delivery'), ref('dana_sig')], UNASSIGNED))).toBe(
        'resolved',
      );
      const after = sent.length;
      expect(await refusalOf(form.assign([ref('reference'), ref('dana_sig')], ANYONE))).toBe(
        'invalid-input',
      );
      expect(sent).toHaveLength(after);
    } finally {
      await sender.destroy();
    }
    const designer = await boot(ANYONE_FIELDS_PDF.slice(), {
      token: ANYONE_FIELD_TOKENS.designer,
    });
    try {
      expect(await refusalOf(designer.form.assign([ref('dana_name')], ANYONE))).toEqual({
        code: 'permission-denied',
        permission: 'fields:set-group:all',
      });
    } finally {
      await designer.destroy();
    }
  });

  it('update() takes an assignment, and the released group id, from any assignment', async () => {
    const sender = await boot(ANYONE_FIELDS_PDF.slice(), { token: ANYONE_FIELD_TOKENS.sender });
    try {
      const { form, sent } = sender;
      await form.update(ref('dana_name'), { assignment: ANYONE });
      expect(form.get(ref('dana_name'))).toMatchObject({ groupId: null, assignment: ANYONE });
      expect(sent.at(-1)![0]).toMatchObject({ patch: { assignment: ANYONE } });
      await form.update(ref('reference'), { groupId: 'dana' });
      expect(form.get(ref('reference'))).toMatchObject({ groupId: 'dana', assignment: GROUP_DANA });
      // Both in one change is refused, and the field stays as it was.
      expect(
        await refusalOf(form.update(ref('notes'), { groupId: 'dana', assignment: ANYONE })),
      ).toBe('invalid-input');
      expect(form.get(ref('notes'))).toMatchObject({ assignment: ANYONE });
    } finally {
      await sender.destroy();
    }
  });

  it('a field’s settings offer the assignments the user may give, beside its group', async () => {
    const sender = await boot(ANYONE_FIELDS_PDF.slice(), { token: ANYONE_FIELD_TOKENS.sender });
    const designer = await boot(ANYONE_FIELDS_PDF.slice(), {
      token: ANYONE_FIELD_TOKENS.designer,
    });
    try {
      const keysOf = (settings: { properties: readonly { key: string }[] } | null) =>
        settings!.properties.map((property) => property.key);
      const assignmentOf = (settings: ReturnType<typeof sender.form.getFieldSettings>) =>
        settings!.properties.find((property) => property.key === 'assignment');
      const settings = sender.form.getFieldSettings(ref('dana_name'))!;
      const keys = keysOf(settings);
      // The released `groupId` row stays, for a panel that knows only groups.
      expect(keys.indexOf('assignment')).toBe(keys.indexOf('groupId') + 1);
      expect(assignmentOf(settings)).toEqual({
        key: 'assignment',
        control: 'assignment',
        label: 'Filled in by',
        labelKey: 'form.settings.assignment',
        options: [UNASSIGNED, GROUP_DANA, { kind: 'group', groupId: 'ada' }, ANYONE],
      });
      expect(settings.values.assignment).toEqual(GROUP_DANA);
      expect(sender.form.getFieldSettings(ref('reference'))!.values.assignment).toEqual(ANYONE);
      // Never anyone on a signature field, and only what the user may give.
      expect(
        assignmentOf(sender.form.getFieldSettings(ref('dana_sig')))!.options,
      ).not.toContainEqual(ANYONE);
      expect(assignmentOf(designer.form.getFieldSettings(ref('dana_name')))!.options).toEqual([
        UNASSIGNED,
        GROUP_DANA,
      ]);
    } finally {
      await sender.destroy();
      await designer.destroy();
    }
  });
});
