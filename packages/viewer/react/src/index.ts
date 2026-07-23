/**
 * @embedpdf/viewer-react — the full viewer as a React component.
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
import {
  createElement,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from 'react';
import type { EmbedPdfViewerElement, ViewerConfig, ViewerHandle } from '@embedpdf/viewer';

// Register <embedpdf-viewer> (side effect) — the wrapper is unusable without it.
import '@embedpdf/viewer';

// Re-export the whole customization vocabulary so apps import ONE package.
export * from '@embedpdf/viewer';

export interface PDFViewerProps extends ViewerConfig {
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

export function PDFViewer({
  className,
  style,
  children,
  elementRef,
  onReady,
  ...config
}: PDFViewerProps) {
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
