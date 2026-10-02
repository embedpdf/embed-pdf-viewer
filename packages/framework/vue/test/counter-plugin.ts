/**
 * A document plugin with a small state, its declaration, its settings, and a
 * fake engine that opens any document at once and saves it as its id: enough
 * of a kernel to mount composables against real capability resolution.
 */
import { defineComponent, h, nextTick } from 'vue';
import type { Component, VNodeChild } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createCapabilityToken, defineState, definePlugin, toPageRef } from '@embedpdf/core';
import type {
  AnyPlugin,
  DocumentHandle,
  Engine,
  Kernel,
  PageLayout,
  SettingsApi,
} from '@embedpdf/core';
import { Viewer } from '../src/runtime';

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
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
};

const handleFor = (id: string) =>
  ({
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    security: { allows: () => true, allowsAnnotation: () => true },
    // The "file" is the document's id, so a test can tell which document was saved.
    download: () => Promise.resolve(new TextEncoder().encode(id)),
    close: () => Promise.resolve(),
  }) as unknown as DocumentHandle;

export const counterEngine = {
  open: (input: { id?: string }) => Promise.resolve(handleFor(input.id ?? 'doc')),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

export const bytesInput = (id: string) => ({
  kind: 'bytes' as const,
  id,
  bytes: new Uint8Array(),
});

/** A component that runs `setup` and renders what it returns, or nothing. */
export const probe = (setup: () => (() => VNodeChild) | void): Component =>
  defineComponent({
    setup() {
      return setup() ?? (() => null);
    },
  });

/** Wait for a condition the app reaches asynchronously (a kernel start, a document open). */
export async function until(condition: () => boolean, attempts = 50): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (condition()) return;
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition never became true');
}

/** Let a kernel change reach the components: promises settle, then Vue renders. */
export async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
}

/** The Viewer around `content`, and its kernel once the content has mounted. */
export async function viewerWith(
  plugins: AnyPlugin[],
  content: () => VNodeChild,
  engine: Engine = counterEngine,
) {
  let kernel: Kernel | null = null;
  const wrapper = mount(Viewer, {
    props: {
      engine,
      plugins,
      onReady: (ready: Kernel) => {
        kernel = ready;
      },
    },
    slots: { default: () => h('div', { 'data-testid': 'mounted' }, [content()]) },
    attachTo: document.body,
  });
  await until(() => wrapper.find('[data-testid="mounted"]').exists());
  return { kernel: kernel as unknown as Kernel, wrapper };
}
