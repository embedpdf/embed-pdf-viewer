import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import {
  pageSpaceBoxesOf,
  type FormFieldDTO,
  type FormFieldRef,
  type FormSnapshot,
} from '@embedpdf/engine-core/runtime';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../../src/form.plugin';
import { FormToken } from '../../src/host-contract';

/**
 * The text someone is typing in a field waits in the plugin until blur or Enter commits it. A
 * download commits it first, so the file has what the user sees.
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 };
const page = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: pageSpaceBoxesOf({ media: box, crop: box, bleed: box, trim: box, art: box }),
  pdfCropBox: box,
} as PageLayout;

const NAME: FormFieldRef = { kind: 'objectNumber', objectNumber: 5 };

const textField = (value: string): FormFieldDTO =>
  ({
    ref: NAME,
    name: 'name',
    family: 'text',
    origin: 'acroform',
    readOnly: false,
    required: false,
    noExport: false,
    alternateName: null,
    mappingName: null,
    widgets: [{ objectNumber: 9, page: toPageRef(1) }],
    value,
    valueEntry: { kind: 'scalar', value },
    defaultValue: '',
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
  }) as unknown as FormFieldDTO;

const snapshot: FormSnapshot = {
  formKind: 'acroform',
  needsAppearances: false,
  widgets: [],
  fields: [textField('')],
  calculationOrder: [],
};

/** A document whose value writes wait until the test lets them land. */
async function boot() {
  const log: string[] = [];
  const listeners = new Set<(event: unknown) => void>();
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
      list: () => Promise.resolve(snapshot),
      setValue: (_ref: unknown, value: { value: string }) =>
        new Promise((resolve) =>
          writes.push(() => {
            log.push(`write:${value.value}`);
            const result = {
              field: textField(value.value),
              meta: { affectedPages: [], cacheDelta: null, changedFields: [], changedWidgets: [] },
            };
            // Like both real engines: the event is published before the promise settles.
            const event = { type: 'forms.valueSet', origin: { kind: 'local' }, ...result };
            listeners.forEach((listener) => listener(event));
            resolve(result);
          }),
        ),
    },
    download: vi.fn(async () => {
      log.push('download');
      return new Uint8Array([1]);
    }),
    // Calls' facts and working sets change nothing here: the same document.
    with() {
      return this;
    },
    setWorkingSet: () => {},
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [interactionPlugin(), formPlugin()] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  await tick();
  return { kernel, form: kernel.capability(FormToken, 'd'), writes, log };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('the text being typed in a field', () => {
  it('is written before a download reads the file', async () => {
    const { kernel, form, writes, log } = await boot();
    form.draftText(NAME, 'Ada Lovelace'); // typing: nothing is written yet
    expect(writes).toHaveLength(0);

    const saving = kernel.documents.download('d');
    await tick();
    expect(writes).toHaveLength(1); // the download committed the draft
    expect(log).toEqual([]);

    writes[0]!();
    await saving;
    expect(log).toEqual(['write:Ada Lovelace', 'download']);
    await kernel.destroy();
  });

  it('is written once on commit, and a discarded draft is never written', async () => {
    const { kernel, form, writes } = await boot();
    form.draftText(NAME, 'Ada');
    const committed = form.commitDraftText(NAME);
    await tick();
    writes[0]!();
    await expect(committed).resolves.not.toBeNull(); // written
    await expect(form.commitDraftText(NAME)).resolves.toBeNull(); // nothing left to write

    form.draftText(NAME, 'Grace');
    form.discardDraftText(NAME); // Escape
    await kernel.documents.download('d');
    expect(writes).toHaveLength(1);
    await kernel.destroy();
  });
});
