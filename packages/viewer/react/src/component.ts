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
 * bridge because none is needed: a slot is a child.
 *
 * Config is init-only (the element's contract). Later prop changes are
 * ignored; remount with a `key` to rebuild the viewer.
 */
// `ElementConfig` is the kernel's config — the widest of all, with the engine
// seam left `unknown` — so the shared implementation sits above every door and
// each entry re-types it narrower by plain assignment (parameter types are
// contravariant, so this direction needs no cast). Every import here is
// type-only, which is what keeps this module engine-blind.
import type { ElementConfig, EmbedPdfViewerElement, ViewerHandle } from '@embedpdf/viewer/core';
import {
  createElement,
  useLayoutEffect,
  useRef,
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
  /** The drive surface, once the viewer is live: capabilities via
   *  `viewer.get(Token)`, `watch`, and the command trio. */
  onReady?: (viewer: ViewerHandle) => void;
  /** The active document changed (a tab switch, an open, the last close) —
   *  the React face of the element's `epdf:documentchange` event. */
  onDocumentChange?: (documentId: string | null) => void;
}

/** Init-only config: after mount, a changed prop is ignored. Dev warns once. */
const warnConfigChange = (initial: ElementConfig, next: ElementConfig): void => {
  const keys = new Set([...Object.keys(initial), ...Object.keys(next)]);
  for (const key of keys) {
    if (
      !Object.is((initial as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])
    ) {
      console.warn(
        `[embedpdf] <PDFViewer> config is init-only: the changed \`${key}\` prop is ignored. ` +
          'Pass stable references (module scope, useState, useMemo), or remount with a `key` to rebuild the viewer.',
      );
      return;
    }
  }
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
  const configRef = useRef(config);
  configRef.current = config;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;
  // Init-only, like <Viewer engine/plugins>: the element boots once with the
  // first config. A later change cannot mean "rebuild" without dropping every
  // open document, so it is ignored — loudly, in development.
  const initialConfig = useRef<ElementConfig | null>(null);
  const warned = useRef(false);
  if (process.env.NODE_ENV !== 'production') {
    if (initialConfig.current === null) initialConfig.current = config;
    else if (!warned.current) {
      warned.current = true;
      warnConfigChange(initialConfig.current, config);
    }
  }

  // Layout effects run in the insertion task, before the element's deferred
  // (microtask) declarative mount — so the viewer boots exactly once, with
  // this config, and the ready listener is in place before it can fire.
  // Empty deps: config is init-only by contract.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onEvent = () => element.viewer && onReadyRef.current?.(element.viewer);
    const onDocumentChangeEvent = (event: Event) =>
      onDocumentChangeRef.current?.(
        (event as CustomEvent<{ documentId: string | null }>).detail.documentId,
      );
    element.addEventListener('epdf:ready', onEvent);
    element.addEventListener('epdf:documentchange', onDocumentChangeEvent);
    element.config = configRef.current;
    // A remount-with-key that reuses a live element cannot miss the event.
    if (element.viewer) onEvent();
    return () => {
      element.removeEventListener('epdf:ready', onEvent);
      element.removeEventListener('epdf:documentchange', onDocumentChangeEvent);
    };
  }, []);

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
    children,
  );
}
