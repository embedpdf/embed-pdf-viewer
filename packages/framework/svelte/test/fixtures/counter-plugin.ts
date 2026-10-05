/**
 * A document plugin with a small state, its declaration and its settings, and a fake engine that
 * opens any document at once and saves it as its id: enough of a kernel to test readers against
 * real capability resolution.
 */
import { createCapabilityToken, defineState, definePlugin, toPageRef } from '@embedpdf/core';
import type { DocumentHandle, Engine, PageLayout, SettingsApi } from '@embedpdf/core';

export interface CounterSettings {
  readonly step: number;
  readonly theme: { readonly color: string; readonly width: number };
}

export interface CounterCapability extends SettingsApi<CounterSettings> {
  getCount(): number;
  getLabel(): string;
  increment(): void;
  setLabel(label: string): void;
  /** Wakes every reader without changing a field. */
  touch(): void;
  /** A verb that returns a promise, as most document verbs do. */
  save(name: string): Promise<string>;
  readonly notes: { add(text: string): void; publish(text: string): Promise<void> };
}

export const CounterToken = createCapabilityToken<CounterCapability>('counter', {
  promises: { save: true, 'notes.publish': true },
});

interface CounterState {
  readonly count: number;
  readonly label: string;
}

const COUNTER_DEFAULTS: CounterSettings = { step: 1, theme: { color: 'red', width: 1 } };

export const counterPlugin = definePlugin({
  id: 'counter',
  scope: 'document',
  token: CounterToken,
  state: (): CounterState => ({ count: 0, label: 'start' }),
  settings: { defaults: COUNTER_DEFAULTS },
  create: (ctx) => ({
    api: {
      ...ctx.settings().api,
      getCount: () => ctx.state.get().count,
      getLabel: () => ctx.state.get().label,
      increment: () => ctx.state.update((state) => ({ ...state, count: state.count + 1 })),
      // A new object even when the label is the same, so the store still changes.
      setLabel: (label) => ctx.state.update((state) => ({ ...state, label })),
      touch: () => ctx.notify(),
      save: async (name) => name,
      notes: { add: () => {}, publish: async () => {} },
    },
  }),
});

export const counterState = defineState(CounterToken, {
  read: (counter) => ({ count: counter.getCount(), label: counter.getLabel() }),
  empty: { count: -1, label: '' },
});

const box = { x: 0, y: 0, width: 600, height: 800 };
/** A 600 × 800 page at `index`, with object number `index + 1`. */
export const pageAt = (index: number): PageLayout => ({
  index,
  ref: toPageRef(index + 1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
});
export const testPage: PageLayout = pageAt(0);

const handleFor = (id: string, pageCount = 1) =>
  ({
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: {
      list: () =>
        Promise.resolve({
          pageCount,
          pages: Array.from({ length: pageCount }, (_, index) => pageAt(index)),
        }),
    },
    security: { allows: () => true, allowsAnnotation: () => true },
    // The "file" is the document's id, so a test can tell which document was saved.
    download: () => Promise.resolve(new TextEncoder().encode(id)),
    // Calls' facts and working sets change nothing here: the same document.
    with() {
      return this;
    },
    setWorkingSet: () => {},
    close: () => Promise.resolve(),
  }) as unknown as DocumentHandle;

export const counterEngine = {
  open: (input: { id?: string }) => Promise.resolve(handleFor(input.id ?? 'doc')),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

/** The same engine, opening every document with `pageCount` pages. */
export const pagedEngine = (pageCount: number) =>
  ({
    open: (input: { id?: string }) => Promise.resolve(handleFor(input.id ?? 'doc', pageCount)),
    destroy: () => Promise.resolve(),
  }) as unknown as Engine;

export const bytesInput = (id: string) => ({
  kind: 'bytes' as const,
  id,
  bytes: new Uint8Array(),
});
