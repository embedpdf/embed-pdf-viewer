import { describe, expect, it } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import type { FormFieldDTO, FormSnapshot } from '@embedpdf/engine-core/runtime';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

/**
 * The field tree is a mirror: it is read once, then kept current from the
 * confirmed form events every write publishes, whoever made it. It is read
 * again only when the event stream cannot be trusted (a desync).
 */
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: {
    media: { left: 0, bottom: 0, right: 600, top: 800 },
    crop: { left: 0, bottom: 0, right: 600, top: 800 },
  },
} as PageLayout;

const textField = (value: string): FormFieldDTO =>
  ({
    ref: { kind: 'objectNumber', fieldObjectNumber: 5 },
    fieldObjectNumber: 5,
    name: 'name',
    family: 'text',
    origin: 'acroform',
    flags: { readOnly: false, required: false, noExport: false, raw: 0 },
    alternateName: null,
    mappingName: null,
    widgets: [{ annotObjectNumber: 9, page: toPageRef(1) }],
    value,
    valueEntry: { kind: 'scalar', value },
    defaultValue: '',
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
  }) as unknown as FormFieldDTO;

const NOTHING_CHANGED = {
  affectedPages: [],
  cacheDelta: null,
  changedFields: [],
  changedWidgets: [],
};

const snapshot = (value: string): FormSnapshot => ({
  formKind: 'acroform',
  needsAppearances: false,
  fields: [textField(value)],
  calculationOrder: [],
});

const origin = (kind: 'local' | 'remote') => ({
  kind,
  sessionId: kind === 'local' ? 'me' : 'them',
  sub: null,
  ts: 0,
  serverId: null,
});

async function boot() {
  const listeners = new Set<(event: unknown) => void>();
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));
  const reads: Array<(snapshot: FormSnapshot) => void> = [];
  const writes: Array<() => void> = [];
  const handle = {
    id: 'd',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    security: { allows: () => true },
    forms: {
      list: () => new Promise<FormSnapshot>((resolve) => reads.push(resolve)),
      setValue: (_ref: unknown, value: { value: string }) =>
        new Promise((resolve) =>
          writes.push(() => {
            const result = { field: textField(value.value), meta: NOTHING_CHANGED };
            // Like both real engines: the event is published before the promise settles.
            emit({ type: 'forms.valueSet', origin: origin('local'), ...result });
            resolve(result);
          }),
        ),
    },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [interactionPlugin(), formPlugin()] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return { kernel, form: kernel.capability(FormToken, 'd'), reads, writes, emit };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));
const nameValue = (form: { getValue(ref: never): unknown }) =>
  form.getValue({ kind: 'objectNumber', fieldObjectNumber: 5 } as never);

describe('form fields mirror', () => {
  it('reads the field tree once and applies own and remote writes from their events', async () => {
    const harness = await boot();
    expect(harness.reads).toHaveLength(1);
    harness.reads[0]!(snapshot('initial'));
    await settle();
    expect(harness.form.getStatus()).toBe('ready');

    const written = harness.form.setValueRaw(
      { kind: 'objectNumber', fieldObjectNumber: 5 },
      {
        type: 'text',
        value: 'own',
      },
    );
    await settle();
    harness.writes[0]!();
    await written;
    expect(nameValue(harness.form as never)).toEqual({ type: 'text', value: 'own' });

    harness.emit({
      type: 'forms.valueSet',
      origin: origin('remote'),
      field: textField('remote'),
      meta: NOTHING_CHANGED,
    });
    expect(nameValue(harness.form as never)).toEqual({ type: 'text', value: 'remote' });
    expect(harness.reads).toHaveLength(1);
    await harness.kernel.destroy();
  });

  it('keeps a field disabled while its own write is in flight, even when other events land', async () => {
    const harness = await boot();
    harness.reads[0]!(snapshot('initial'));
    await settle();
    const written = harness.form.setText({ kind: 'objectNumber', fieldObjectNumber: 5 }, 'typed');
    await settle();
    harness.emit({
      type: 'forms.valueSet',
      origin: origin('remote'),
      field: textField('remote edit'),
      meta: NOTHING_CHANGED,
    });
    expect(harness.form.getFillItem(9)?.disabled).toBe(true);
    harness.writes[0]!();
    await written;
    expect(harness.form.getFillItem(9)?.disabled).toBe(false);
    await harness.kernel.destroy();
  });

  it('re-reads after a desync; a burst costs at most one extra read', async () => {
    const harness = await boot();
    harness.reads[0]!(snapshot('initial'));
    await settle();
    harness.emit({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 });
    harness.emit({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 });
    expect(harness.reads).toHaveLength(2);
    harness.reads[1]!(snapshot('after desync'));
    await settle();
    expect(harness.reads).toHaveLength(3);
    harness.reads[2]!(snapshot('after desync'));
    await settle();
    expect(harness.reads).toHaveLength(3);
    expect(nameValue(harness.form as never)).toEqual({ type: 'text', value: 'after desync' });
    await harness.kernel.destroy();
  });
});
