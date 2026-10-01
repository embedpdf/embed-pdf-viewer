import * as React from 'react';
import { render, waitFor } from '@testing-library/react';
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

/**
 * A document plugin with a small state, its declaration, its settings, and a
 * fake engine that opens any document at once and saves it as its id: enough
 * of a kernel to render hooks against real capability resolution.
 */

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
  readonly notes: { add(text: string): void };
}

export const CounterToken = createCapabilityToken<CounterCapability>('counter');

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
      notes: { add: () => {} },
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

const counterEngine = {
  open: (input: { id?: string }) => Promise.resolve(handleFor(input.id ?? 'doc')),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

export const bytesInput = (id: string) => ({
  kind: 'bytes' as const,
  id,
  bytes: new Uint8Array(),
});

/** The Viewer around `children`, and its kernel once the children are mounted. */
export async function viewerWith(
  plugins: AnyPlugin[],
  children: React.ReactNode,
  engine: Engine = counterEngine,
) {
  let kernel: Kernel | null = null;
  const element = (content: React.ReactNode) => (
    <Viewer engine={engine} plugins={plugins} onReady={(ready) => (kernel = ready)}>
      <div data-testid="mounted">{content}</div>
    </Viewer>
  );
  const { getByTestId, rerender } = render(element(children));
  await waitFor(() => getByTestId('mounted'));
  return {
    kernel: kernel as unknown as Kernel,
    rerender: (content: React.ReactNode) => rerender(element(content)),
  };
}
