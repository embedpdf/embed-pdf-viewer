/**
 * <PDFViewer> — the React face of the <embedpdf-viewer> custom element, and
 * deliberately ENGINE-BLIND: this module imports the viewer for TYPES ONLY, so
 * it holds no runtime edge to any engine. Which engine ships is decided by the
 * ENTRY that re-exports it:
 *
 *   ./index.ts → `@embedpdf/viewer`      — local PDFium engine, registered as
 *                                          the default (the zero-config door)
 *   ./core.ts  → `@embedpdf/viewer/core` — no default engine; you inject one,
 *                                          and PDFium is structurally absent
 *
 * That side-effect import is the ENTIRE difference between the two doors, and
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
 * The wrapper is deliberately thin (the v2 pattern): it renders the
 * <embedpdf-viewer> custom element, hands it the config before its deferred
 * first mount, and passes children straight through as LIGHT DOM — the
 * browser projects a child with `slot="name"` into the chrome's matching
 * `custom()` socket while the child stays in the host React tree, so its
 * context, state, and page CSS all keep working. There is no reactSlot()
 * bridge because none is needed: a slot IS a child.
 *
 * Config is init-only (the element's contract). Later prop changes are
 * ignored; remount with a `key` to rebuild the viewer.
 */
// `ElementConfig` is the KERNEL's config — the widest of all, with the engine
// seam left `unknown` — so the shared implementation sits above every door and
// each entry re-types it NARROWER by plain assignment (parameter types are
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
  /** The DRIVE surface, once the viewer is live (v2's onReady, reborn):
   *  capabilities via `viewer.get(Token)`, `watch`, and the command trio. */
  onReady?: (viewer: ViewerHandle) => void;
}

/**
 * Props for the shared implementation. Each entry re-exports <PDFViewer>
 * narrowed to ITS door's config — see `PDFViewerProps` in ./index.ts (engine
 * optional) and ./core.ts (engine required).
 */
export type PDFViewerImplProps = ElementConfig & PDFViewerExtras;

export function PDFViewer({
  className,
  style,
  children,
  elementRef,
  onReady,
  ...config
}: PDFViewerImplProps) {
  const ref = useRef<EmbedPdfViewerElement | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Layout effects run in the insertion task, BEFORE the element's deferred
  // (microtask) declarative mount — so the viewer boots exactly once, with
  // this config, and the ready listener is in place before it can fire.
  // Empty deps: config is init-only by contract.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onEvent = () => el.viewer && onReadyRef.current?.(el.viewer);
    el.addEventListener('epdf:ready', onEvent);
    el.config = configRef.current;
    // A remount-with-key that reuses a live element cannot miss the event.
    if (el.viewer) onEvent();
    return () => el.removeEventListener('epdf:ready', onEvent);
  }, []);

  return createElement(
    'embedpdf-viewer',
    {
      ref: (el: EmbedPdfViewerElement | null) => {
        ref.current = el;
        if (typeof elementRef === 'function') elementRef(el);
        else if (elementRef)
          (elementRef as MutableRefObject<EmbedPdfViewerElement | null>).current = el;
      },
      className,
      style,
    },
    children,
  );
}
