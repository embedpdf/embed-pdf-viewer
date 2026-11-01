/**
 * <PDFViewer>: the Vue face of the <embedpdf-viewer> custom element, and
 * engine-blind on purpose: this module imports the viewer for types only, so it
 * holds no runtime edge to any engine. Which engine ships is decided by the
 * entry that defines the component:
 *
 *   ./index.ts → `@embedpdf/viewer`      — the local PDFium engine, registered as
 *                                          the default (the zero-config door)
 *   ./core.ts  → `@embedpdf/viewer/core` — no default engine; you pass one,
 *                                          and PDFium is not in the module graph
 *
 * ```vue
 * <PDFViewer src="/report.pdf" style="height: 100vh">
 *   <ToolbarItem id="doc-picker"><DocPicker /></ToolbarItem>   <!-- slot="item:doc-picker" -->
 * </PDFViewer>
 * ```
 *
 * It renders the custom element, hands it the config before its deferred first
 * mount, and renders its slot as the element's light-DOM children: the browser
 * shows a child with `slot="item:<id>"` in the viewer's matching place while
 * the child stays in the app's component tree, so what it injects, its state and
 * the page's CSS keep working. The children mount once the viewer is ready,
 * inside its kernel, so the headless composables of `@embedpdf/vue` in them
 * read this viewer, and `usePDFViewer()` gives them its `viewer`. When the
 * viewer goes they unmount with it, and mount again inside the next one.
 *
 * On the server it renders the empty element, and the viewer starts in the
 * browser: nothing here, or in the viewer it imports, touches the DOM when
 * imported.
 *
 * Every config key is a prop, and `v-bind="config"` passes a whole config.
 * `src`, `theme`, `locale`, `disable`, `readOnly` and `fetch` follow their
 * props: the element changes them in place. The callbacks are events (`@ready`,
 * `@document-change`, `@panel-resize`), so they reach the handler the app gives
 * now. Every other prop is read once, when the viewer starts; a later change is
 * ignored (development warns), and a new `key` mounts a new viewer with it.
 * `class`, `style` and other attributes go on the element.
 */
// `ElementConfig` is the kernel's config, the widest of all, with the engine seam left `unknown`:
// the setup below takes it, so each entry defines the component with its own, narrower config and
// passes the setup as it is (parameter types are contravariant, so this direction needs no cast).
// Every import from the viewer is type-only, which keeps this module engine-blind.
import type {
  ElementConfig,
  EmbedPdfViewerElement,
  LiveConfigKey,
  PanelResizeEvent,
  Viewer,
} from '@embedpdf/viewer/core';
// The headless runtime carries no engine: it gives the children the viewer's kernel.
import { KernelProvider, type Kernel } from '@embedpdf/vue/runtime';
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  provide,
  shallowRef,
  toRaw,
  watch,
  type ComponentOptionsMixin,
  type CreateComponentPublicInstanceWithMixins,
  type EmitsToProps,
  type PublicProps,
  type SetupContext,
  type SlotsType,
  type VNode,
} from 'vue';

import { ViewerKey } from './composables';

/** The config keys the viewer calls back with: events here. */
type CallbackKey = 'onReady' | 'onDocumentChange' | 'onPanelResize';

/** A door's config as props: every key but the callbacks, which are events. */
export type PDFViewerPropsOf<Config extends object> = Omit<Config, CallbackKey>;

/** The props of the shared setup: the kernel's config, the widest. */
export type PDFViewerImplProps = PDFViewerPropsOf<ElementConfig>;

/** The events: the config's callbacks, by their Vue names. */
export type PDFViewerEmits = {
  /** The viewer is live, before any document has opened: its `viewer`, for code outside it. */
  ready: (viewer: Viewer) => true;
  /**
   * The document that's showing: the first one, each one the user switches to, and `null` once
   * the last one closes.
   */
  'document-change': (documentId: string | null) => true;
  /** The user resized a panel: its id and new width in px. */
  'panel-resize': (event: PanelResizeEvent) => true;
};

/** Your components, shown where their slot says: `<ToolbarItem>`, `<Panel>`, `<Region>`. */
export type PDFViewerSlots = SlotsType<{ default?: () => VNode[] }>;

/** What a template ref on <PDFViewer> reads. */
export interface PDFViewerExposed {
  /** The `<embedpdf-viewer>` element, for its imperative surface; null before it mounts. */
  readonly elementRef: EmbedPdfViewerElement | null;
}

/**
 * <PDFViewer> typed with a door's props. Vue's own type for a component made from a setup
 * function says nothing of what it exposes, so this one adds what a template ref reads.
 */
export type PDFViewerComponent<Props> = new (
  props: Props & EmitsToProps<PDFViewerEmits> & PublicProps,
) => CreateComponentPublicInstanceWithMixins<
  Props & EmitsToProps<PDFViewerEmits>,
  PDFViewerExposed,
  {},
  {},
  {},
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  PDFViewerEmits,
  PublicProps,
  {},
  false,
  {},
  PDFViewerSlots
>;

/**
 * Every config key, as a prop (TypeScript keeps the list complete). `null` takes any value, which
 * the viewer checks itself; `readOnly` written without a value is `true`, as for any boolean prop
 * (`<PDFViewer read-only />`).
 */
const CONFIG_PROPS = {
  src: null,
  documents: null,
  engine: null,
  commands: null,
  icons: null,
  strings: null,
  locale: null,
  disable: null,
  readOnly: { type: [Boolean, Object], default: undefined },
  scope: null,
  identity: null,
  notAllowed: null,
  layout: null,
  plugins: null,
  fonts: null,
  theme: null,
  fetch: null,
} satisfies Record<keyof PDFViewerImplProps, unknown>;

/** The options each entry defines <PDFViewer> with, next to {@link setupPDFViewer}. */
export const PDF_VIEWER_OPTIONS = {
  name: 'PDFViewer',
  props: CONFIG_PROPS,
  emits: ['ready', 'document-change', 'panel-resize'],
};

/** Where the viewer keeps its kernel (`createViewer` in `@embedpdf/viewer-chrome`). */
const VIEWER_KERNEL = Symbol.for('@embedpdf/viewer/kernel');
const kernelOf = (viewer: Viewer): Kernel | null =>
  (viewer as unknown as Partial<Record<symbol, Kernel>>)[VIEWER_KERNEL] ?? null;

/** A key for each viewer, so the children mount again inside a new one. */
const viewerKeys = new WeakMap<Viewer, number>();
let nextViewerKey = 0;
const keyOf = (viewer: Viewer): number => {
  let key = viewerKeys.get(viewer);
  if (key === undefined) viewerKeys.set(viewer, (key = nextViewerKey++));
  return key;
};

/** The children inside the viewer: its kernel for the headless composables, and the `viewer`. */
const InViewer = defineComponent(
  (props: { viewer: Viewer }, { slots }) => {
    provide(ViewerKey, props.viewer);
    const kernel = kernelOf(props.viewer);
    return () => (kernel ? h(KernelProvider, { kernel }, slots) : slots.default?.());
  },
  { name: 'InViewer', props: ['viewer'] },
);

/** The props the element follows while it runs; the component hands their changes on. */
const LIVE_PROPS: Readonly<Record<LiveConfigKey, true>> = {
  src: true,
  theme: true,
  locale: true,
  disable: true,
  readOnly: true,
  fetch: true,
};

/** The config as the props give it, each value raw: a reactive copy is another object. */
function rawConfigOf<Config extends object>(props: Config): Config {
  const config = { ...props };
  for (const key in config) config[key] = toRaw(config[key]);
  return config;
}

/** Every other prop is read once: a changed one is ignored, and development warns once. */
function warnReadOnceChanges(props: PDFViewerImplProps): void {
  const initial = { ...props };
  const keys = Object.keys(initial) as (keyof PDFViewerImplProps)[];
  const stop = watch(
    () => keys.find((key) => !(key in LIVE_PROPS) && !Object.is(props[key], initial[key])),
    (key) => {
      if (key === undefined) return;
      console.warn(
        `[embedpdf] <PDFViewer>: \`${key}\` is read once, when the viewer starts, so the change is ` +
          'ignored. Pass a stable value (module scope, a const in <script setup>, a shallowRef), ' +
          'or give the viewer a new `key` to mount a new one with it.',
      );
      stop();
    },
  );
}

/**
 * The shared setup. Each entry defines <PDFViewer> from it, typed with its door's config: see
 * `PDFViewer` in ./index.ts (engine optional) and ./core.ts (engine required).
 */
export function setupPDFViewer(
  props: PDFViewerImplProps,
  { emit, slots, expose }: SetupContext<PDFViewerEmits, PDFViewerSlots>,
): () => VNode {
  const element = shallowRef<EmbedPdfViewerElement | null>(null);
  // The viewer once it's ready: the children render inside its kernel, so the headless
  // composables in them read this viewer. Before that the viewer has no places to show them in.
  const viewer = shallowRef<Viewer | null>(null);
  expose({ elementRef: element });

  // Read once, like <Viewer engine plugins>: the element boots once with the first config. A
  // later change to anything but the live props can't mean "rebuild" without dropping every
  // open document, so it is ignored, with a warning in development.
  if (process.env.NODE_ENV !== 'production') warnReadOnceChanges(props);

  // The callbacks reach the element once, as functions that emit: Vue calls the handler the app
  // gives at the time, so a new one each render changes nothing.
  const callbacks: Pick<ElementConfig, CallbackKey> = {
    onReady: (ready) => emit('ready', ready),
    onDocumentChange: (documentId) => emit('document-change', documentId),
    onPanelResize: (event) => emit('panel-resize', event),
  };

  let stopListening: (() => void) | null = null;
  // Mounted hooks run in the task the element was inserted in, before its deferred (microtask)
  // mount, so the viewer boots exactly once, with this config, and the ready listener is in place
  // before it can fire.
  onMounted(() => {
    const target = element.value!;
    // Each mount of the element brings a new viewer: the element taken out and put back.
    const onReady = () => (viewer.value = target.viewer);
    target.addEventListener('epdf:ready', onReady);
    stopListening = () => target.removeEventListener('epdf:ready', onReady);
    target.config = { ...rawConfigOf(props), ...callbacks };
    if (target.viewer) onReady();
  });
  onBeforeUnmount(() => stopListening?.());

  // The live props, on every change of one: the element compares them by value, so an unchanged
  // one (an inline `:disable="['forms']"` too) changes nothing.
  watch(
    () => [props.src, props.theme, props.locale, props.disable, props.readOnly, props.fetch],
    () => {
      const target = element.value;
      if (!target) return;
      target.src = toRaw(props.src);
      target.theme = toRaw(props.theme);
      target.locale = props.locale;
      target.disable = toRaw(props.disable);
      target.readOnly = toRaw(props.readOnly);
      target.fetch = props.fetch;
    },
  );

  return () =>
    h(
      'embedpdf-viewer',
      // The element waits for the config this sets, also over the server's HTML before hydration.
      { ref: element, 'data-epdf-wrapped': '' },
      viewer.value ? [h(InViewer, { key: keyOf(viewer.value), viewer: viewer.value }, slots)] : [],
    );
}
