/**
 * <PDFViewer> — the React face of the <embedpdf-viewer> custom element, and
 * deliberately engine-blind: this module imports the viewer for types only, so
 * it holds no runtime edge to any engine. Which engine ships is decided by the
 * entry that re-exports it:
 *
 *   ./index.ts → `@embedpdf/viewer`      — local PDFium engine, registered as
 *                                          the default (the zero-config door)
 *   ./core.ts  → `@embedpdf/viewer/core` — no default engine; you inject one,
 *                                          and PDFium is structurally absent
 *
 * That side-effect import is the entire difference between the two doors, and
 * it lives only in those two files. A runtime import here would weld PDFium
 * into every consumer's bundle — cloud builds included — so an import-boundary
 * lint rule (see eslint.config.js) holds this module to `import type`.
 *
 * ```tsx
 * <PDFViewer src="/report.pdf" style={{ height: '100vh' }}>
 *   <DocPicker slot="doc-picker" />   // ← children-as-slots
 * </PDFViewer>
 * ```
 *
 * The wrapper is deliberately thin: it renders the <embedpdf-viewer> custom
 * element, hands it the config before its deferred first mount, and passes
 * children straight through as light DOM — the browser projects a child with
 * `slot="name"` into the chrome's matching `custom()` socket while the child
 * stays in the host React tree, so its context, state, and page CSS all keep
 * working. There is no reactSlot()
 * bridge because none is needed: a slot is a child. The children mount once
 * the viewer is ready, inside its kernel, so the headless hooks of
 * `@embedpdf/react` in them read this viewer.
 *
 * `src`, `theme`, `locale`, `disable` and `readOnly` follow their props: the
 * element changes them in place. `onReady` and `onDocumentChange` call the
 * latest prop. Every other prop is read once, when the viewer starts; a later
 * change is ignored (development warns), and a new `key` mounts a new viewer
 * with it.
 */
// The headless runtime carries no engine: it gives the children the viewer's kernel.
import { KernelProvider, type Kernel } from '@embedpdf/react/runtime';
// `ElementConfig` is the kernel's config — the widest of all, with the engine
// seam left `unknown` — so the shared implementation sits above every door and
// each entry re-types it narrower by plain assignment (parameter types are
// contravariant, so this direction needs no cast). Every import from the
// viewer is type-only, which is what keeps this module engine-blind.
import type {
  ElementConfig,
  EmbedPdfViewerElement,
  LiveConfigKey,
  Viewer,
} from '@embedpdf/viewer/core';
import {
  createElement,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from 'react';

/** The framework-side props — everything that is not viewer config. */
export interface PDFViewerExtras {
  className?: string;
  style?: CSSProperties;
  /** Light-DOM slot children: `<Anything slot="socket-name" />`. */
  children?: ReactNode;
  /** The underlying element, if you need the imperative surface. */
  elementRef?: Ref<EmbedPdfViewerElement>;
}

/** Where the viewer keeps its kernel (`createViewer` in `@embedpdf/viewer-chrome`). */
const VIEWER_KERNEL = Symbol.for('@embedpdf/viewer/kernel');
const kernelOf = (viewer: Viewer): Kernel | null =>
  (viewer as unknown as Partial<Record<symbol, Kernel>>)[VIEWER_KERNEL] ?? null;

/** The props the element follows while it runs; the wrapper hands their changes on. */
const LIVE_PROPS: Readonly<Record<LiveConfigKey, true>> = {
  src: true,
  theme: true,
  locale: true,
  disable: true,
  readOnly: true,
};

/** Every other prop is read once: a changed one is ignored, and development warns once. */
const warnConfigChange = (initial: ElementConfig, next: ElementConfig): boolean => {
  const keys = new Set([...Object.keys(initial), ...Object.keys(next)]);
  for (const key of keys) {
    if (key in LIVE_PROPS) continue;
    if (
      !Object.is((initial as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])
    ) {
      console.warn(
        `[embedpdf] <PDFViewer>: \`${key}\` is read once, when the viewer starts, so the change is ` +
          'ignored. Pass a stable value (module scope, useState, useMemo), or give the viewer a new ' +
          '`key` to mount a new one with it.',
      );
      return true;
    }
  }
  return false;
};

/**
 * Props for the shared implementation. Each entry re-exports <PDFViewer>
 * narrowed to its door's config — see `PDFViewerProps` in ./index.ts (engine
 * optional) and ./core.ts (engine required).
 */
export type PDFViewerImplProps = ElementConfig & PDFViewerExtras;

export function PDFViewer({
  className,
  style,
  children,
  elementRef,
  onReady,
  onDocumentChange,
  ...config
}: PDFViewerImplProps) {
  const ref = useRef<EmbedPdfViewerElement | null>(null);
  // The viewer's kernel once it's ready: the children render inside it, so the headless hooks
  // in them read this viewer. Before that the viewer has no sockets to show them in.
  const [kernel, setKernel] = useState<Kernel | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;
  // The callbacks reach the element once, as functions that call the latest prop: an inline
  // callback is a new function every render, and that changes nothing.
  const callbacks = useRef<Pick<ElementConfig, 'onReady' | 'onDocumentChange'>>({
    onReady: (viewer) => onReadyRef.current?.(viewer),
    onDocumentChange: (documentId) => onDocumentChangeRef.current?.(documentId),
  });
  // Read once, like <Viewer engine/plugins>: the element boots once with the
  // first config. A later change to anything but the live props cannot mean
  // "rebuild" without dropping every open document, so it is ignored — loudly,
  // in development.
  const initialConfig = useRef<ElementConfig | null>(null);
  const warned = useRef(false);
  if (process.env.NODE_ENV !== 'production') {
    if (initialConfig.current === null) initialConfig.current = config;
    else if (!warned.current) warned.current = warnConfigChange(initialConfig.current, config);
  }

  // Layout effects run in the insertion task, before the element's deferred
  // (microtask) declarative mount — so the viewer boots exactly once, with
  // this config, and the ready listener is in place before it can fire.
  // Empty deps: config is init-only by contract.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onEvent = () => {
      const viewer = element.viewer;
      if (viewer) setKernel(kernelOf(viewer));
    };
    element.addEventListener('epdf:ready', onEvent);
    element.config = { ...configRef.current, ...callbacks.current };
    // A remount-with-key that reuses a live element cannot miss the event.
    if (element.viewer) onEvent();
    return () => element.removeEventListener('epdf:ready', onEvent);
  }, []);

  // The live props, after every render: the element compares them by value, so an unchanged
  // one (an inline `disable={['forms']}` too) changes nothing.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.src = config.src;
    element.theme = config.theme;
    element.locale = config.locale;
    element.disable = config.disable;
    element.readOnly = config.readOnly;
  });

  return createElement(
    'embedpdf-viewer',
    {
      ref: (element: EmbedPdfViewerElement | null) => {
        ref.current = element;
        if (typeof elementRef === 'function') elementRef(element);
        else if (elementRef)
          (elementRef as MutableRefObject<EmbedPdfViewerElement | null>).current = element;
      },
      className,
      style,
    },
    kernel ? createElement(KernelProvider, { kernel }, children) : null,
  );
}
