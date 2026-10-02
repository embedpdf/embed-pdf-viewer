/**
 * What the tests share: a small document plugin with state, settings and an event, its
 * service, a fake engine that opens any document at once (and "downloads" it as its id), and a
 * host component that provides a viewer around the template a test gives it.
 */
import {
  Component,
  inject,
  Injectable,
  provideZonelessChangeDetection,
  type Type,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  createCapabilityToken,
  createEventHook,
  defineState,
  definePlugin,
  toPageRef,
} from '@embedpdf/core';
import type {
  DocumentHandle,
  Engine,
  EventHook,
  Kernel,
  PageLayout,
  SettingsApi,
} from '@embedpdf/core';
import {
  EpdfKernelHost,
  pluginService,
  provideEmbedPdf,
  type EmbedPdfConfig,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';

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
  readonly onIncremented: EventHook<{ readonly count: number }>;
}

export const CounterToken = createCapabilityToken<CounterCapability>('counter', {
  promises: { save: true },
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
  create: (ctx) => {
    const incremented = createEventHook<{ readonly count: number }>();
    ctx.cleanup(() => incremented.dispose());
    return {
      api: {
        ...ctx.settings().api,
        getCount: () => ctx.state.get().count,
        getLabel: () => ctx.state.get().label,
        increment: () => {
          ctx.state.update((state) => ({ ...state, count: state.count + 1 }));
          incremented.emit({ count: ctx.state.get().count });
        },
        // A new object even for the same label, so the store still changes.
        setLabel: (label) => ctx.state.update((state) => ({ ...state, label })),
        touch: () => ctx.notify(),
        save: async (name) => name,
        onIncremented: incremented.on,
      },
    };
  },
});

export const counterState = defineState(CounterToken, {
  read: (counter) => ({ count: counter.getCount(), label: counter.getLabel() }),
  empty: { count: -1, label: '' },
});

/** The counter's service, built the way every plugin's is. */
@Injectable({ providedIn: 'root' })
export class EpdfCounter extends pluginService({
  name: 'EpdfCounter',
  feature: 'withCounter()',
  token: CounterToken,
  state: counterState,
  methods: ['getCount', 'increment', 'setLabel', 'touch', 'save'],
  events: ['onIncremented'],
}) {}

export const withCounter = (): EmbedPdfFeature => ({
  plugins: [counterPlugin],
  services: [EpdfCounter],
});

const box = { x: 0, y: 0, width: 600, height: 800 };
export const pageLayout = (pageObjectNumber: number, index: number): PageLayout => ({
  index,
  ref: toPageRef(pageObjectNumber),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
});

/** A document handle with `pageCount` pages, whose "file" is its id. */
export const handleFor = (id: string, pageCount = 1) =>
  ({
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: {
      list: () =>
        Promise.resolve({
          pageCount,
          pages: Array.from({ length: pageCount }, (_, index) => pageLayout(index + 1, index)),
        }),
    },
    security: { allows: () => true, allowsAnnotation: () => true },
    download: () => Promise.resolve(new TextEncoder().encode(id)),
    close: () => Promise.resolve(),
  }) as unknown as DocumentHandle;

/** An engine that opens any document at once; `pageCount` pages each. */
export function fakeEngine(pageCount = 1) {
  const opened: { id?: string; options?: unknown }[] = [];
  let destroyed = 0;
  const engine = {
    open: (input: { id?: string }, options?: unknown) => {
      opened.push({ id: input.id, options });
      return Promise.resolve(handleFor(input.id ?? 'doc', pageCount));
    },
    destroy: () => {
      destroyed += 1;
      return Promise.resolve();
    },
  } as unknown as Engine;
  return { engine, opened, destroyedCount: () => destroyed };
}

export const bytesInput = (id: string) => ({
  kind: 'bytes' as const,
  id,
  bytes: new Uint8Array(),
});

/**
 * A component that provides a viewer and renders `template`: what an app's component with
 * `providers: [provideEmbedPdf(…)]` is. It can inject the viewer's services itself.
 */
export function viewerHost(options: {
  template: string;
  imports?: Type<unknown>[];
  config?: Partial<EmbedPdfConfig>;
  features?: EmbedPdfFeature[];
}): Type<{ readonly viewer: EpdfKernelHost }> {
  const config: EmbedPdfConfig = { engine: fakeEngine().engine, ...options.config };
  @Component({
    selector: 'test-host',
    imports: options.imports ?? [],
    providers: [provideEmbedPdf(config, ...(options.features ?? [withCounter()]))],
    template: options.template,
  })
  class Host {
    readonly viewer = inject(EpdfKernelHost);
  }
  return Host;
}

/** Create `component` zoneless, and wait until it's stable. */
export async function mount<T>(component: Type<T>): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(component);
  await fixture.whenStable();
  return fixture;
}

/** The viewer's kernel, once it exists. */
export function kernelOf(fixture: ComponentFixture<{ readonly viewer: EpdfKernelHost }>): Kernel {
  const kernel = fixture.componentInstance.viewer.kernel();
  if (!kernel) throw new Error('the viewer has no kernel yet');
  return kernel;
}
