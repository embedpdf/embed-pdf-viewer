/**
 * What a field is for, and the shape of its value, on a real engine: a field placed with a value
 * tool keeps its purpose through a save, an empty one shows its purpose's label, `prefill()`
 * writes the session's own values as one change, a date field made here reads as one after a
 * save, and a date is checked and shown the same way with the document's scripts on and off.
 */
import { createKernel, timerClock, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { BANDS_PNG, CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  type AnnotationRef,
  type Change,
  type ChangeOp,
  type FormField,
  type FormFieldRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { i18nPlugin, I18nToken } from '@embedpdf/plugin-i18n';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FORM_DEFAULTS, type FormConfig } from '../src/contract';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

let engine: Engine;
/** The fixture's own fields, which the tests leave alone. */
let fixtureFields: ReadonlySet<string>;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const doc = await engine.open(
    { kind: 'bytes', id: 'fixture', bytes: CHANGE_FIXTURE_PDF.slice() },
    { scope: ['*'] },
  );
  fixtureFields = new Set((await doc.forms.list()).fields.map((field) => field.name));
  await doc.close();
});
afterAll(async () => {
  await engine.destroy();
});

const ref = (name: string): FormFieldRef => ({ kind: 'fqn', name });

/** The day the tests run on, as the host's calendar says: what `prefill()` writes as the date. */
const TODAY = { year: 2026, month: 11, day: 26 };

const DANA = {
  userId: 'u_381',
  displayName: 'Dana Smith',
  email: 'dana@fernquill.example',
  organization: 'Fernquill Ltd',
  title: 'Operations',
};

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
            // An undo names the change it undoes, and carries no ops of its own.
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
  readonly scope?: readonly string[];
  readonly identity?: Record<string, string>;
  readonly config?: FormConfig;
  /** Whether the document's scripts run: the actions plugin with JavaScript on. */
  readonly scripts?: boolean;
  /** The viewer's language, with the i18n plugin; without it, there is no i18n plugin. */
  readonly locale?: string;
  /** The day the host's calendar says; {@link TODAY} unless a test says another. */
  readonly today?: { year: number; month: number; day: number };
}

async function boot(bytes: Uint8Array, options: BootOptions = {}) {
  let inner: DocumentHandle | null = null;
  const sent: ChangeOp[][] = [];
  const kernel = createKernel({
    // The host's timers, and a calendar that says what day it is.
    clock: { ...timerClock, today: () => options.today ?? TODAY },
    engine: recording(engine, sent, (doc) => (inner = doc)),
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      ...(options.scripts
        ? [actionsPlugin({ javascript: { enabled: true, sandboxFactory: createQuickJsSandbox } })]
        : []),
      annotationPlugin(),
      formPlugin(options.config ?? {}),
      historyPlugin(),
      // The app's languages, with no strings of its own: the labels are EmbedPDF's.
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
  await kernel.documents.open({ kind: 'bytes', id: `purposes-${Math.random()}`, bytes }, {
    scope: options.scope ?? ['*'],
    ...(options.identity ? { identity: options.identity } : {}),
  } as never);
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  await annotation.whenSynced();
  const page = (await doc.pages.list()).pages[0]!.ref as PageRef;
  await form.ensureLoaded(page);
  const widgetOf = (field: FormField): AnnotationRef => {
    const widget = field.widgets[0]!;
    return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
  };
  /** A click on the page with a field tool, and the field it placed once the engine answered. */
  const place = async (tool: string, point: { x: number; y: number }): Promise<FormField> => {
    const before = new Set(form.list().map((field) => field.name));
    interaction.activateTool(tool);
    const sample = (phase: 'down' | 'up') => ({
      phase,
      viewport: { x: 0, y: 0 },
      page: { ref: page, point },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    });
    interaction.dispatchPointer(sample('down'));
    interaction.dispatchPointer(sample('up'));
    let placed: FormField | undefined;
    await vi.waitFor(async () => {
      const read = (await doc.forms.list()).fields.find((field) => !before.has(field.name));
      expect(read).toBeDefined();
      placed = read;
    });
    await vi.waitFor(() => expect(form.get(placed!.ref)).not.toBeNull());
    return form.get(placed!.ref)!;
  };
  /** One step back, or forward again, once the engine answered. */
  const step = (direction: 'undo' | 'redo'): Promise<void> =>
    new Promise((resolve, reject) => {
      const offDone = history.onUndone(() => {
        offDone();
        offFailed();
        resolve();
      });
      const offFailed = history.onUndoFailed((event) => {
        offDone();
        offFailed();
        reject(new Error(`${direction} failed: ${JSON.stringify(event)}`));
      });
      history[direction]();
    });
  /** The box of a field as the form layer draws it. */
  const boxOf = (name: string) =>
    form.listWidgets(page).find((item) => form.get(item.fieldRef)?.name === name);
  /** Each of the test's fields' value as the engine holds it now. */
  const truth = async () =>
    Object.fromEntries(
      (await doc.forms.list()).fields
        .filter((field) => !fixtureFields.has(field.name))
        .map((field) => [field.name, field.kind === 'text' ? field.value : null]),
    );
  return {
    kernel,
    doc,
    form,
    annotation,
    interaction,
    history,
    undo: () => step('undo'),
    redo: () => step('redo'),
    page,
    sent,
    widgetOf,
    place,
    boxOf,
    truth,
    destroy: () => kernel.destroy(),
  };
}

/**
 * A form with one text field per entry, each at its own height on the first page; an entry's
 * `value` is filled in after the field is made.
 */
async function formWith(
  fields: readonly Record<string, unknown>[],
  base: Uint8Array = CHANGE_FIXTURE_PDF.slice(),
): Promise<Uint8Array> {
  const doc = await engine.open(
    { kind: 'bytes', id: `author-${Math.random()}`, bytes: base },
    { scope: ['*'] },
  );
  const page = (await doc.pages.list()).pages[0]!.ref;
  let y = 40;
  for (const { value, ...field } of fields) {
    await doc.forms.create({
      kind: 'text',
      widgets: [{ page, rect: { x: 40, y, width: 160, height: 24 } }],
      ...field,
    } as never);
    if (typeof value === 'string') {
      await doc.forms.setValue({ kind: 'fqn', name: String(field.name) }, { value });
    }
    y += 40;
  }
  const bytes = await doc.download();
  await doc.close();
  return bytes;
}

describe('what a field is for, on a real engine', () => {
  it('a field placed with the Name tool keeps its purpose through a save, and prefill() fills it in', async () => {
    const sender = await boot(CHANGE_FIXTURE_PDF.slice());
    let saved: Uint8Array;
    try {
      const placed = await sender.place('form-name', { x: 120, y: 300 });
      expect(placed).toMatchObject({ kind: 'text', purpose: 'name', readOnly: false });
      // What form-text places, and the purpose: the same name family, look and size.
      expect(placed.name).toBe('text_1');
      const row = sender.form.getWidget(sender.widgetOf(placed))!;
      expect([row.rect.width, row.rect.height]).toEqual([160, 24]);
      saved = await sender.doc.download();
    } finally {
      sender.destroy();
    }

    const signer = await boot(saved, { identity: DANA });
    try {
      const { form } = signer;
      const field = form.get(ref('text_1'))!;
      expect(field.purpose).toBe('name');
      // Empty, it says what it is for; the words are the layer's, never the field's value.
      // A field of typed text puts it where its text goes: as the field aligns it, left here.
      expect(signer.boxOf('text_1')).toMatchObject({
        purpose: 'name',
        format: null,
        empty: true,
        placeholder: 'Name',
        placeholderAlign: 'left',
      });

      const result = await form.prefill();
      expect(result).toEqual({ applied: [field.ref], skipped: [], failed: [] });
      expect(await signer.truth()).toEqual({ text_1: 'Dana Smith' });
      expect(signer.boxOf('text_1')).toMatchObject({ empty: false, placeholder: null });

      // A second call writes nothing: the field has a value.
      const again = await form.prefill();
      expect(again).toEqual({
        applied: [],
        skipped: [{ ref: field.ref, reason: 'filled' }],
        failed: [],
      });
    } finally {
      signer.destroy();
    }
  });

  it('prefill() is one change and one step to undo, for the fields the identity has a value for', async () => {
    const bytes = await formWith([
      { name: 'who', purpose: 'name' },
      { name: 'mail', purpose: 'email' },
      { name: 'firm', purpose: 'organization' },
      { name: 'job', purpose: 'organization-title' },
      { name: 'day', purpose: 'date-signed', format: { kind: 'date', pattern: 'yyyy-mm-dd' } },
      { name: 'ticket', purpose: 'ticket-number' },
      { name: 'plain' },
      { name: 'taken', purpose: 'name', value: 'Somebody Else' },
    ]);
    const signer = await boot(bytes, { identity: { ...DANA, title: undefined } as never });
    try {
      const { form, history, sent } = signer;
      // A word of the app's own came back from the saved file as it was written.
      expect(form.get(ref('ticket'))!.purpose).toBe('ticket-number');
      const before = sent.length;
      const result = await form.prefill();
      expect(result.applied).toEqual([
        form.get(ref('who'))!.ref,
        form.get(ref('mail'))!.ref,
        form.get(ref('firm'))!.ref,
        form.get(ref('day'))!.ref,
      ]);
      // No title in the identity; a field that has a value is left alone.
      expect(result.skipped).toEqual([
        { ref: form.get(ref('job'))!.ref, reason: 'no-value' },
        { ref: form.get(ref('taken'))!.ref, reason: 'filled' },
      ]);
      expect(result.failed).toEqual([]);
      expect(await signer.truth()).toEqual({
        who: 'Dana Smith',
        mail: 'dana@fernquill.example',
        firm: 'Fernquill Ltd',
        job: '',
        // The day of signing is today, on the host's calendar, in the field's own pattern.
        day: '2026-11-26',
        // A word of the app's own has no value here, and a field without a purpose is no one's.
        ticket: '',
        plain: '',
        taken: 'Somebody Else',
      });
      // One change went to the engine, with the four values.
      expect(sent.length - before).toBe(1);
      expect(sent.at(-1)!.filter((op) => op.type === 'forms.setValue')).toHaveLength(4);

      expect(history.getUndoLabel()).toEqual({ key: 'form.fill', count: 4 });
      await signer.undo();
      expect(await signer.truth()).toMatchObject({ who: '', mail: '', firm: '', day: '' });
      expect(history.canUndo()).toBe(false);
      await signer.redo();
      expect(await signer.truth()).toMatchObject({
        who: 'Dana Smith',
        mail: 'dana@fernquill.example',
        firm: 'Fernquill Ltd',
      });
    } finally {
      signer.destroy();
    }
  });

  it('prefill() writes a read-only field, and only the fields the session may fill in', async () => {
    const bytes = await formWith([
      { name: 'mine', purpose: 'name', groupId: 'buyer' },
      { name: 'locked', purpose: 'email', groupId: 'buyer', readOnly: true },
      { name: 'theirs', purpose: 'name', groupId: 'seller' },
      { name: 'nobody', purpose: 'name' },
    ]);
    const buyer = await boot(bytes, {
      scope: ['doc.open', 'doc.render', 'doc.forms.read', 'fields:fill:group=buyer'],
      identity: { ...DANA, groupId: 'buyer' },
    });
    try {
      const { form } = buyer;
      // A read-only field takes no typing, and it is still the session's to fill in from code.
      expect(buyer.boxOf('locked')).toMatchObject({ disabled: true, canFill: true });
      const result = await form.prefill();
      expect(result).toEqual({
        applied: [form.get(ref('mine'))!.ref, form.get(ref('locked'))!.ref],
        skipped: [],
        failed: [],
      });
      expect(await buyer.truth()).toEqual({
        mine: 'Dana Smith',
        locked: 'dana@fernquill.example',
        theirs: '',
        nobody: '',
      });
    } finally {
      buyer.destroy();
    }
  });

  it('a field’s purpose and format are settings: read, written, undone, and kept by a copy', async () => {
    const designer = await boot(
      await formWith([{ name: 'when' }, { name: 'box', kind: 'checkbox' }]),
    );
    try {
      const { form } = designer;
      expect(form.listPurposes().map((purpose) => purpose.id)).toEqual([
        'name',
        'email',
        'organization',
        'organization-title',
        'date-signed',
        'signature',
        'initials',
      ]);

      const settings = form.getFieldSettings(ref('when'))!;
      expect(settings.properties.find((each) => each.key === 'purpose')).toMatchObject({
        control: 'choice',
        free: false,
        options: form.listPurposes().map((purpose) => purpose.id),
      });
      const format = settings.properties.find((each) => each.key === 'format')!;
      expect(format).toMatchObject({ control: 'format', kinds: ['date', 'time'] });
      expect(format.control === 'format' && format.patterns.date).toContain('m/d/yy');
      expect(settings.values).toMatchObject({ purpose: null, format: null });
      // A checkbox has a purpose and no format.
      const keys = form.getFieldSettings(ref('box'))!.properties.map((each) => each.key);
      expect(keys).toContain('purpose');
      expect(keys).not.toContain('format');

      await form.update(ref('when'), {
        purpose: 'delivery-day',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      });
      expect(form.get(ref('when'))).toMatchObject({
        purpose: 'delivery-day',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      });
      const after = form.getFieldSettings(ref('when'))!;
      // A word of the app's own is offered beside the ones the plugin knows.
      expect(after.properties.find((each) => each.key === 'purpose')).toMatchObject({
        options: [...form.listPurposes().map((purpose) => purpose.id), 'delivery-day'],
      });
      expect(after.values).toMatchObject({
        purpose: 'delivery-day',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      });
      // No label for that word, so nothing to show in the empty field.
      expect(designer.boxOf('when')).toMatchObject({
        purpose: 'delivery-day',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
        placeholder: null,
      });

      // A pattern the engine doesn't take is refused before anything shows or is sent.
      const sentBefore = designer.sent.length;
      await expect(
        form.update(ref('when'), { format: { kind: 'date', pattern: 'yyyymmdd' } }),
      ).rejects.toMatchObject({ code: 'invalid-input' });
      await expect(
        form.update(ref('when'), { format: { kind: 'time', pattern: 'dd/mm/yyyy' } }),
      ).rejects.toMatchObject({ code: 'invalid-input' });
      await expect(
        form.update(ref('box'), { format: { kind: 'date', pattern: 'dd/mm/yyyy' } } as never),
      ).rejects.toMatchObject({ code: 'invalid-input' });
      await expect(form.update(ref('when'), { purpose: ' padded ' })).rejects.toMatchObject({
        code: 'invalid-input',
      });
      expect(designer.sent.length).toBe(sentBefore);
      expect(form.get(ref('when'))).toMatchObject({ format: { pattern: 'dd/mm/yyyy' } });

      // A copy keeps both.
      const { fields } = await form.duplicate([form.get(ref('when'))!.ref]);
      expect(fields[0]).toMatchObject({
        purpose: 'delivery-day',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      });

      // Undo takes the copy away, then the purpose and the format; redo brings them back.
      await designer.undo();
      await designer.undo();
      expect(form.get(ref('when'))).toMatchObject({ purpose: null, format: null });
      await designer.redo();
      expect(form.get(ref('when'))).toMatchObject({
        purpose: 'delivery-day',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      });
      await form.update(ref('when'), { purpose: null, format: null });
      expect(form.get(ref('when'))).toMatchObject({ purpose: null, format: null });
    } finally {
      designer.destroy();
    }
  });

  it('a date field made with the Date signed tool reads as a date field after a save', async () => {
    const sender = await boot(CHANGE_FIXTURE_PDF.slice());
    let saved: Uint8Array;
    try {
      const placed = await sender.place('form-date-signed', { x: 120, y: 300 });
      expect(placed).toMatchObject({
        kind: 'text',
        purpose: 'date-signed',
        format: { kind: 'date', pattern: 'yyyy-mm-dd' },
        readOnly: true,
      });
      const row = sender.form.getWidget(sender.widgetOf(placed))!;
      expect([row.rect.width, row.rect.height]).toEqual([100, 24]);
      saved = await sender.doc.download();
    } finally {
      sender.destroy();
    }
    const reader = await boot(saved);
    try {
      const field = reader.form.get(ref('text_1'))!;
      expect(field).toMatchObject({
        purpose: 'date-signed',
        format: { kind: 'date', pattern: 'yyyy-mm-dd' },
        readOnly: true,
      });
      // In the file a date format is Acrobat's two scripts, which is what makes it a date there.
      expect(field.actions).toMatchObject({
        format: { root: { script: 'AFDate_FormatEx("yyyy-mm-dd");' } },
        keystroke: { root: { script: 'AFDate_KeystrokeEx("yyyy-mm-dd");' } },
      });
      // Read-only, so not the reader's to fill in: no tint, no placeholder, and a hint.
      expect(reader.boxOf('text_1')).toMatchObject({
        format: { kind: 'date', pattern: 'yyyy-mm-dd' },
        yours: false,
        accent: null,
        placeholder: null,
        hint: 'Filled in when you sign',
      });
    } finally {
      reader.destroy();
    }
  });

  it('every other tool places what it placed: no purpose, no format, no placeholder', async () => {
    const sender = await boot(CHANGE_FIXTURE_PDF.slice());
    try {
      const text = await sender.place('form-text', { x: 120, y: 200 });
      const signature = await sender.place('form-signature', { x: 120, y: 300 });
      const dropdown = await sender.place('form-combobox', { x: 120, y: 400 });
      expect(text).toMatchObject({ purpose: null, format: null, required: false, readOnly: false });
      expect(dropdown).toMatchObject({ purpose: null, format: null });
      // The signature tool's field says what it's for, and an empty one says so.
      expect(signature).toMatchObject({ kind: 'signature', purpose: 'signature', required: false });
      sender.interaction.activateTool('pointer');
      for (const item of sender.form.listWidgets(sender.page)) {
        if (sender.form.get(item.fieldRef)?.name === signature.name) {
          expect(item).toMatchObject({ purpose: 'signature', placeholder: 'Signature' });
        } else {
          expect(item).toMatchObject({ purpose: null, format: null, placeholder: null });
        }
      }
    } finally {
      sender.destroy();
    }
  });

  it('an app makes its own field tool from an existing one, and changes a built-in one', async () => {
    const sender = await boot(CHANGE_FIXTURE_PDF.slice(), {
      config: {
        tools: [
          {
            id: 'form-company-number',
            extends: 'form-text',
            field: { purpose: 'company-number', required: true },
          },
          {
            id: 'form-date',
            extends: 'form-text',
            field: { format: { kind: 'date', pattern: 'dd/mm/yyyy' } },
            clickCreate: { width: 100, height: 24 },
          },
          { id: 'form-date-signed', field: { format: { kind: 'date', pattern: 'dd/mm/yyyy' } } },
        ],
      },
    });
    try {
      const number = await sender.place('form-company-number', { x: 120, y: 200 });
      expect(number).toMatchObject({ kind: 'text', purpose: 'company-number', required: true });
      const date = await sender.place('form-date', { x: 120, y: 300 });
      expect(date).toMatchObject({
        purpose: null,
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
      });
      expect(sender.form.getWidget(sender.widgetOf(date))!.rect.width).toBe(100);
      // The built-in tool keeps what the entry doesn't name: its purpose and its read-only flag.
      const signed = await sender.place('form-date-signed', { x: 120, y: 400 });
      expect(signed).toMatchObject({
        purpose: 'date-signed',
        format: { kind: 'date', pattern: 'dd/mm/yyyy' },
        readOnly: true,
      });
      // The tools are the annotation plugin's too: a palette lists them.
      const ids = sender.annotation.tools.list().map((tool) => tool.id);
      expect(ids).toEqual(
        expect.arrayContaining(['form-name', 'form-company-number', 'form-date']),
      );
    } finally {
      sender.destroy();
    }
  });

  it('an empty field says what it is for in the viewer’s language', async () => {
    const session = await boot(await formWith([{ name: 'who', purpose: 'name' }]), {
      locale: 'nl',
    });
    try {
      const { form } = session;
      const i18n = session.kernel.capability(I18nToken);
      await vi.waitFor(() => expect(i18n.getLocale()).toBe('nl'));
      expect(form.listPurposes().slice(0, 2)).toEqual([
        { id: 'name', label: 'Naam' },
        { id: 'email', label: 'E-mail' },
      ]);
      expect(session.boxOf('who')).toMatchObject({ placeholder: 'Naam' });
      // The same array while nothing changes, and a new one with the language.
      const dutch = form.listPurposes();
      expect(form.listPurposes()).toBe(dutch);
      await i18n.setLocale('en');
      expect(form.listPurposes()).not.toBe(dutch);
      expect(session.boxOf('who')).toMatchObject({ placeholder: 'Name' });
      // The app's own words for a purpose win over the plugin's.
      i18n.addTranslations('en', { form: { purposes: { name: 'Full name' } } });
      expect(session.boxOf('who')).toMatchObject({ placeholder: 'Full name' });
    } finally {
      session.destroy();
    }
  });

  it('a lent field shows what it is for while it is empty, in the placeholder color', async () => {
    const designer = await boot(
      await formWith([
        { name: 'who', purpose: 'name' },
        { name: 'known', purpose: 'email', value: 'dana@fernquill.example' },
        { name: 'plain' },
      ]),
      { config: { fields: { placeholder: '#64748b' } } },
    );
    try {
      const { form, annotation, interaction, page } = designer;
      interaction.activateTool('form-edit');
      const placeholderOf = (name: string) =>
        annotation
          .listPageItems(page)
          .find((item) => item.id === annotationKey(designer.widgetOf(form.get(ref(name))!)))
          ?.placeholder ?? null;
      await vi.waitFor(() =>
        expect(placeholderOf('who')).toEqual({ text: 'Name', color: '#64748b' }),
      );
      expect(placeholderOf('known')).toBeNull();
      expect(placeholderOf('plain')).toBeNull();
      // The color is a setting: a change reaches the lent fields.
      form.updateSettings({ fields: { placeholder: 'tomato' } });
      await vi.waitFor(() =>
        expect(placeholderOf('who')).toEqual({ text: 'Name', color: 'tomato' }),
      );
    } finally {
      designer.destroy();
    }
  });

  it('a signature box with a mark drawn in it shows no placeholder, while filling and in design mode', async () => {
    const signer = await boot(
      await formWith([{ kind: 'signature', name: 'sign', purpose: 'signature', required: true }]),
    );
    try {
      const { doc, form, annotation, interaction, page } = signer;
      const sign = ref('sign');
      /** The mark as the signature plugin draws one: into the box, without signing. */
      const draw = () => doc.forms.setSignatureAppearance!(sign, BANDS_PNG.slice());
      const takeOut = () => doc.forms.setSignatureAppearance!(sign, null);
      const shown = () => signer.boxOf('sign')!.placeholder;
      const missing = () => form.validate().missing.map((field) => field.name);

      // Empty: the box says what it is for, in the middle, where the mark goes.
      expect(signer.boxOf('sign')).toMatchObject({
        empty: true,
        placeholder: 'Signature',
        placeholderAlign: 'center',
      });
      expect(missing()).toEqual(['sign']);

      // With a mark in it, the box holds something to look at, and the word goes.
      await draw();
      await vi.waitFor(() => expect(shown()).toBeNull());
      // The field is as empty as it was: only a signature fills it in.
      expect(signer.boxOf('sign')).toMatchObject({ empty: true, signed: false });
      expect(missing()).toEqual(['sign']);

      // Taken out again, the word is back.
      const cleared = await takeOut();
      await vi.waitFor(() => expect(shown()).toBe('Signature'));
      // Undo of that brings the mark back, and redo takes it out again.
      const undone = await doc.apply({ undoOf: cleared.meta.opId });
      await vi.waitFor(() => expect(shown()).toBeNull());
      await doc.apply({ undoOf: undone.meta.opId });
      await vi.waitFor(() => expect(shown()).toBe('Signature'));

      // Design mode: the lent box follows the same rule, from the same widget.
      interaction.activateTool('form-edit');
      const lent = () =>
        annotation
          .listPageItems(page)
          .find((item) => item.id === annotationKey(signer.widgetOf(form.get(sign)!)))
          ?.placeholder ?? null;
      // Centred there too, as the form layer puts it.
      const word = { text: 'Signature', color: FORM_DEFAULTS.fields.placeholder, align: 'center' };
      await vi.waitFor(() => expect(lent()).toEqual(word));
      const drawn = await draw();
      await vi.waitFor(() => expect(lent()).toBeNull());
      const back = await doc.apply({ undoOf: drawn.meta.opId });
      await vi.waitFor(() => expect(lent()).toEqual(word));
      await doc.apply({ undoOf: back.meta.opId });
      await vi.waitFor(() => expect(lent()).toBeNull());
      // The mark stays through a change of mode, and so does the rule.
      interaction.activateTool('pointer');
      await vi.waitFor(() => expect(signer.boxOf('sign')).toBeDefined());
      expect(shown()).toBeNull();
      await takeOut();
      await vi.waitFor(() => expect(shown()).toBe('Signature'));
    } finally {
      signer.destroy();
    }
  });
});

describe('the date of signing', () => {
  const BUYER = {
    scope: ['doc.open', 'doc.render', 'doc.download', 'doc.forms.read', 'fields:fill:group=buyer'],
    identity: { ...DANA, groupId: 'buyer' },
  };
  const signedOn = (name: string, more: Record<string, unknown> = {}) => ({
    name,
    purpose: 'date-signed',
    groupId: 'buyer',
    readOnly: true,
    ...more,
  });

  it('prefill() writes today into it, in its own pattern, and it is never still to fill in', async () => {
    const bytes = await formWith([
      signedOn('dated', { format: { kind: 'date', pattern: 'dd/mm/yyyy' } }),
      signedOn('plain'),
      signedOn('kept', { value: '2026-11-20' }),
      signedOn('theirs', { groupId: 'seller' }),
      { name: 'who', purpose: 'name', groupId: 'buyer', required: true },
    ]);
    const buyer = await boot(bytes, BUYER);
    let saved: Uint8Array;
    try {
      const { form } = buyer;
      const missing = () => form.validate().missing.map((field) => field.name);
      // Before Start: printed text, with a hint for the person whose date it is, and not missing.
      expect(missing()).toEqual(['who']);
      expect(buyer.boxOf('dated')).toMatchObject({
        canFill: true,
        yours: false,
        disabled: true,
        accent: null,
        placeholder: null,
        hint: 'Filled in when you sign',
      });
      expect(buyer.boxOf('theirs')).toMatchObject({ canFill: false, yours: false, hint: null });

      const result = await form.prefill();
      expect(result.applied).toEqual([
        form.get(ref('dated'))!.ref,
        form.get(ref('plain'))!.ref,
        form.get(ref('who'))!.ref,
      ]);
      expect(result.skipped).toEqual([{ ref: form.get(ref('kept'))!.ref, reason: 'filled' }]);
      expect(await buyer.truth()).toEqual({
        // The field's own date pattern, else yyyy-mm-dd; a date already written stays.
        dated: '26/11/2026',
        plain: '2026-11-26',
        kept: '2026-11-20',
        theirs: '',
        who: 'Dana Smith',
      });
      expect(missing()).toEqual([]);
      expect(buyer.boxOf('dated')).toMatchObject({ yours: false, placeholder: null });
      saved = await buyer.doc.download();
    } finally {
      buyer.destroy();
    }

    // The signer comes back the next day: the date written the first time stays.
    const later = await boot(saved, { ...BUYER, today: { year: 2026, month: 11, day: 27 } });
    try {
      const result = await later.form.prefill();
      expect(result.applied).toEqual([]);
      expect(await later.truth()).toMatchObject({ dated: '26/11/2026', plain: '2026-11-26' });
    } finally {
      later.destroy();
    }
  });

  it('the hint is in the viewer’s language', async () => {
    const buyer = await boot(await formWith([signedOn('dated')]), { ...BUYER, locale: 'nl' });
    try {
      expect(buyer.boxOf('dated')!.hint).toBe('Ingevuld wanneer u ondertekent');
    } finally {
      buyer.destroy();
    }
  });
});

describe('a field’s look and its tint', () => {
  const fieldsFor = () =>
    formWith([
      { name: 'mine', purpose: 'name', groupId: 'buyer' },
      { name: 'theirs', purpose: 'name', groupId: 'seller' },
      { name: 'nobody', purpose: 'email' },
      { name: 'locked', purpose: 'organization', readOnly: true },
    ]);
  const BUYER = {
    scope: ['doc.open', 'doc.render', 'doc.forms.read', 'fields:fill:group=buyer'],
    identity: { ...DANA, groupId: 'buyer' },
  };

  it('while filling, only the fields you fill in show a tint and a placeholder', async () => {
    const buyer = await boot(await fieldsFor(), BUYER);
    try {
      const { form } = buyer;
      const buyerColor = form.listGroups().find((group) => group.id === 'buyer')!.color;
      expect(buyer.boxOf('mine')).toMatchObject({
        yours: true,
        accent: { color: buyerColor, strength: 0.16 },
        placeholder: 'Name',
      });
      // Someone else's field, a field for nobody the buyer may not fill, a read-only one: as in the PDF.
      for (const name of ['theirs', 'nobody', 'locked']) {
        expect(buyer.boxOf(name)).toMatchObject({ yours: false, accent: null, placeholder: null });
      }
    } finally {
      buyer.destroy();
    }
  });

  it('a field in no group takes `fields.tintColor`, which is off at first', async () => {
    const scope = ['doc.open', 'doc.render', 'doc.forms.read', 'doc.forms.fill'];
    const plain = await boot(await fieldsFor(), { scope });
    try {
      // As an upgraded app has it: a field in no group has no tint.
      expect(plain.boxOf('nobody')).toMatchObject({
        yours: true,
        accent: null,
        placeholder: 'Email',
      });
      plain.form.updateSettings({ fields: { tintColor: '#0ea5e9' } });
      expect(plain.boxOf('nobody')).toMatchObject({
        accent: { color: '#0ea5e9', strength: 0.16, base: true },
      });
      // One tint per field: a field in a group keeps its group's color; read-only takes none.
      expect(plain.boxOf('mine')!.accent).toMatchObject({ strength: 0.16 });
      expect(plain.boxOf('mine')!.accent!.base).toBeUndefined();
      expect(plain.boxOf('locked')).toMatchObject({ yours: false, accent: null });
      // A tint of `0` turns every tint off, the base one too.
      plain.form.updateSettings({ fields: { tint: 0 } });
      expect(plain.boxOf('nobody')!.accent).toBeNull();
    } finally {
      plain.destroy();
    }
  });

  it('in design mode every field shows: its tint, else an outline in `fields.border`', async () => {
    const bytes = await formWith([
      { name: 'mine', groupId: 'buyer' },
      { name: 'nobody' },
      { name: 'framed' },
    ]);
    const designer = await boot(bytes);
    try {
      const { form, annotation, interaction, page } = designer;
      // A field with a border of its own shows by its look.
      await form.updateWidget(designer.widgetOf(form.get(ref('framed'))!), { color: '#334155' });
      interaction.activateTool('form-edit');
      const itemOf = (name: string) =>
        annotation
          .listPageItems(page)
          .find((item) => item.id === annotationKey(designer.widgetOf(form.get(ref(name))!)));
      await vi.waitFor(() => expect(itemOf('nobody')).toBeDefined());
      expect(itemOf('mine')).toMatchObject({ accent: { strength: 0.16 } });
      expect(itemOf('mine')!.outline).toBeUndefined();
      // No look and no tint: the edge `fields.border` gives, `null` for the accent's.
      expect(itemOf('nobody')!.outline).toEqual({ color: null });
      expect(itemOf('framed')!.outline).toBeUndefined();
      // With a base tint, a field in no group shows it instead.
      form.updateSettings({ fields: { border: '#64748b', tintColor: '#0ea5e9' } });
      await vi.waitFor(() =>
        expect(itemOf('nobody')!.accent).toEqual({ color: '#0ea5e9', strength: 0.16, base: true }),
      );
      expect(itemOf('nobody')!.outline).toBeUndefined();
      form.updateSettings({ fields: { tintColor: null } });
      await vi.waitFor(() => expect(itemOf('nobody')!.outline).toEqual({ color: '#64748b' }));
    } finally {
      designer.destroy();
    }
  });

  it('a field tool’s ghost is the field it places, see-through', async () => {
    const designer = await boot(CHANGE_FIXTURE_PDF.slice(), {
      config: {
        tools: [
          { id: 'form-bare', extends: 'form-name', defaults: { color: null, interiorColor: null } },
        ],
      },
    });
    try {
      const { form, annotation, interaction, page } = designer;
      form.setGroups([{ id: 'buyer', label: 'Dana Smith', color: '#2563eb' }]);
      form.setDesignGroup('buyer');
      const point = { x: 120, y: 300 };
      const hover = (tool: string, at = point) => {
        interaction.activateTool(tool);
        interaction.dispatchPointer({
          phase: 'move',
          viewport: { x: 0, y: 0 },
          page: { ref: page, point: at },
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        });
        return annotation.listPageItems(page).find((item) => item.source === 'ghost');
      };
      const ghost = hover('form-name')!;
      expect(ghost).toMatchObject({
        accent: { color: '#2563eb', strength: 0.16 },
        placeholder: { text: 'Name', color: FORM_DEFAULTS.fields.placeholder },
        ghostOpacity: 0.5,
      });
      expect(ghost.outline).toBeUndefined();
      // The field's own look, drawn by the form's painter: a placed field's drawing, not a kind's.
      const ghostScene = ghost.lentScene!();
      expect(ghostScene.length).toBeGreaterThan(0);

      // Placed where the ghost was, the field paints the same: its drawing, tint and placeholder.
      const placed = await designer.place('form-name', point);
      const item = annotation
        .listPageItems(page)
        .find((each) => each.id === annotationKey(designer.widgetOf(placed)))!;
      expect(item.accent).toEqual(ghost.accent);
      expect(item.placeholder).toEqual(ghost.placeholder);
      expect(item.lentScene!()).toEqual(ghostScene);

      // A tool with no border and no background shows its outline, as its field will. (Away
      // from the placed field: over it, the field takes the pointer, and no ghost shows.)
      form.setDesignGroup(null);
      const bare = hover('form-bare', { x: 120, y: 500 })!;
      expect(bare).toMatchObject({ outline: { color: null }, placeholder: { text: 'Name' } });
      expect(bare.accent).toBeUndefined();
    } finally {
      designer.destroy();
    }
  });
});

describe('a date is checked and shown the same with the document’s scripts on and off', () => {
  /** The ops one value write sent, and how it ended, with scripts on or off. */
  const write = async (bytes: Uint8Array, scripts: boolean, name: string, text: string) => {
    const session = await boot(bytes, { scripts });
    try {
      const { form, sent } = session;
      const rejected: string[] = [];
      form.onValidationRejected(({ field }) => rejected.push(field.name));
      const before = sent.length;
      const { status } = await form.setValue(ref(name), { value: text });
      const field = form.get(ref(name))!;
      return {
        status,
        rejected,
        value: field.kind === 'text' ? field.value : null,
        stored: (await session.truth())[name],
        ops: sent.slice(before).flat(),
      };
    } finally {
      session.destroy();
    }
  };

  it.each([
    ['date', 'day', '5/3/26', '05/03/2026'],
    ['date', 'day', '05/03/2026', '05/03/2026'],
    ['date', 'long', 'March 5, 2026', 'Mar 5, 2026'],
    ['time', 'clock', '2:07 pm', '14:07'],
    ['time', 'clock', '14:07', '14:07'],
  ])('a %s field %s given %s shows %s', async (_kind, name, typed, shown) => {
    const bytes = await formWith([
      { name: 'day', format: { kind: 'date', pattern: 'dd/mm/yyyy' } },
      { name: 'long', format: { kind: 'date', pattern: 'mmm d, yyyy' } },
      { name: 'clock', format: { kind: 'time', pattern: 'HH:MM' } },
    ]);
    const on = await write(bytes, true, name, typed);
    const off = await write(bytes, false, name, typed);
    expect(on.status).toBe('applied');
    // The same ops reach the engine: the typed text as the value, and the text the field shows.
    expect(off.ops).toEqual(on.ops);
    expect(off.ops).toEqual([
      { type: 'forms.setValue', field: expect.anything(), value: { value: typed } },
      { type: 'forms.setAppearanceText', field: expect.anything(), text: shown },
    ]);
    expect(off).toEqual(on);
  });

  it.each([
    ['day', 'soon'],
    ['day', '31/02/2026'],
    ['clock', '25:99'],
  ])('text that is no date is refused in %s: %s', async (name, typed) => {
    const bytes = await formWith([
      { name: 'day', format: { kind: 'date', pattern: 'dd/mm/yyyy' } },
      { name: 'clock', format: { kind: 'time', pattern: 'HH:MM' } },
    ]);
    const on = await write(bytes, true, name, typed);
    const off = await write(bytes, false, name, typed);
    expect(on).toEqual({ status: 'rejected', rejected: [name], value: '', stored: '', ops: [] });
    expect(off).toEqual(on);
  });

  it('an empty text is no date and no mistake, and a format of its own script is left to it', async () => {
    const bytes = await formWith([
      { name: 'day', format: { kind: 'date', pattern: 'dd/mm/yyyy' }, value: '05/03/2026' },
      {
        name: 'amount',
        actions: {
          format: { type: 'javascript', script: 'AFNumber_Format(2, 0, 0, 0, "", true);' },
          keystroke: { type: 'javascript', script: 'AFNumber_Keystroke(2, 0, 0, 0, "", true);' },
        },
      },
    ]);
    const on = await write(bytes, true, 'day', '');
    const off = await write(bytes, false, 'day', '');
    expect(off.status).toBe('applied');
    expect(off.stored).toBe('');
    expect(off.status).toBe(on.status);
    expect(off.stored).toBe(on.stored);

    // `other`: with no script running, the field takes any text, as it did.
    const session = await boot(bytes);
    try {
      expect(session.form.get(ref('amount'))).toMatchObject({ format: { kind: 'other' } });
      const { status } = await session.form.setValue(ref('amount'), { value: 'twelve' });
      expect(status).toBe('applied');
      expect((await session.truth()).amount).toBe('twelve');
    } finally {
      session.destroy();
    }
  });

  it('with `validation: "none"` nothing is checked or formatted, dates included', async () => {
    const bytes = await formWith([
      { name: 'day', format: { kind: 'date', pattern: 'dd/mm/yyyy' } },
    ]);
    const session = await boot(bytes, { config: { validation: 'none' } });
    try {
      const before = session.sent.length;
      const { status } = await session.form.setValue(ref('day'), { value: 'soon' });
      expect(status).toBe('applied');
      expect(session.sent.slice(before).flat()).toEqual([
        { type: 'forms.setValue', field: expect.anything(), value: { value: 'soon' } },
      ]);
    } finally {
      session.destroy();
    }
  });
});
