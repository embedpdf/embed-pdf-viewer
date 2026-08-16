/**
 * <PageView> — a single page surface with NO Stage.
 *
 * Same layers + rotation + chrome frame as a `<Stage>` page, but no
 * camera/scroll/zoom and, crucially, NO dependency on `@embedpdf/plugin-stage`.
 * It builds its own `PageTransform` from a target content width and shares the
 * exact `PageContext` seam, so every layer (RenderLayer, AnnotationLayer, …)
 * works here identically — and it provides the measured `ViewProjector`, so
 * anchored UI (`<AnnotationMenu>`, `<SelectionMenu>`) works here too, portalled
 * and clipping-immune.
 */
import * as React from 'react';
import { useMemo, useRef } from 'react';
import { NO_FRAME, pageTransform, type PageFrame } from '@embedpdf/core-geometry';
import { observeClientGeometry } from '@embedpdf/web';
import { ProjectorProvider, type ProjectorBinding, type ViewProjector } from './anchored';
import {
  DocumentScope,
  makePageContext,
  PageProvider,
  useActiveDocumentId,
  useKernel,
} from './runtime';

export interface PageViewProps {
  page: number;
  /** Which document to show. Defaults to the active document. */
  documentId?: string;
  /** Target width for the page CONTENT; the display box is the rotated footprint. */
  width?: number;
  /** Reserved chrome bands around the page (screen px) — same model as `<Stage>`. */
  pageFrame?: PageFrame;
  /** Page-space content (rotates with the page). */
  children: React.ReactNode;
  /** Box-space chrome (label, border, …) — never rotated. Mirrors `<Stage pageChrome>`. */
  pageChrome?: React.ReactNode;
  style?: React.CSSProperties;
}

/** A single page surface with NO Stage — same layers + rotation + chrome frame,
 *  no camera/scroll/zoom. */
export function PageView({
  page,
  documentId,
  width = 240,
  pageFrame = NO_FRAME,
  children,
  pageChrome,
  style,
}: PageViewProps) {
  const kernel = useKernel();
  const active = useActiveDocumentId();
  const ref = useRef<HTMLDivElement>(null);
  const docId = documentId ?? active;
  const meta = docId ? kernel.getState().core.documents[docId] : undefined;
  const base = meta?.pages[page];
  const pon = base?.pageObjectNumber ?? page + 1;
  const rotation = base?.rotation ?? 0;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  // Standalone (no Stage/camera): build the page's transform from the target
  // content `width` directly. `scale` is view px per point = width / pageWidthPts.
  const transform = useMemo(
    () =>
      pageTransform({
        pageSize: base
          ? { width: base.size.width, height: base.size.height }
          : { width: 1, height: 1 },
        rotation,
        scale: base ? width / base.size.width : 1,
        // Physical 100% on the web: 1pt = 96/72 CSS px, times the page's
        // /UserUnit — so `transform.zoom` is meaningful even without a Stage
        // (a thumbnail-sized PageView reads as zoomed out, as it should).
        baseScale: (96 / 72) * (base?.userUnit ?? 1),
        dpr,
      }),
    [base?.size.width, base?.size.height, base?.userUnit, rotation, width, dpr],
  );
  const ctx = useMemo(
    () =>
      makePageContext(docId ?? '', pon, page, pageFrame, transform, () =>
        ref.current!.getBoundingClientRect(),
      ),
    [docId, pon, page, pageFrame, transform],
  );
  // The PageView's ViewProjector: no camera, so anchored UI positions by
  // MEASURING the DOM (client space → portal + position:fixed, immune to
  // ancestor overflow clipping). `toScreen` answers null until the page
  // element has committed — <Anchored> forces one post-commit pass to pick
  // it up. The binding's revision covers state-driven changes (a new
  // transform/page); `observeClientGeometry` covers the genuinely
  // browser-driven ones (document scroll, window resize) that no state
  // change announces.
  const projector = useMemo<ViewProjector>(
    () => ({
      space: 'client',
      toScreen: (p, rect) => (p === ctx.pon && ref.current ? ctx.toClientRect(rect) : null),
      toScreenPoint: (p, at) => (p === ctx.pon && ref.current ? ctx.toClientPoint(at) : null),
      viewEnv: (p) =>
        p === ctx.pon
          ? {
              scale: ctx.transform.viewScale,
              rotation: ctx.transform.rotation,
              zoom: ctx.transform.zoom,
            }
          : null,
    }),
    [ctx],
  );
  const projectorBinding = useMemo<ProjectorBinding>(
    () => ({ projector, revision: ctx, subscribe: observeClientGeometry }),
    [projector, ctx],
  );
  if (!docId || !meta || !base) return null;
  const t = transform;
  const outerW = t.viewWidth + pageFrame.left + pageFrame.right;
  const outerH = t.viewHeight + pageFrame.top + pageFrame.bottom;
  const contentLeft = pageFrame.left + (t.viewWidth - t.contentWidth) / 2;
  const contentTop = pageFrame.top + (t.viewHeight - t.contentHeight) / 2;
  return (
    <DocumentScope id={docId}>
      <ProjectorProvider value={projectorBinding}>
      <div style={{ position: 'relative', width: outerW, height: outerH, ...style }}>
        <PageProvider value={ctx}>
          {/* drop shadow ONLY — transparent, axis-aligned, can't leak behind the bitmap */}
          <div
            style={{
              position: 'absolute',
              left: pageFrame.left,
              top: pageFrame.top,
              width: t.viewWidth,
              height: t.viewHeight,
              boxShadow: '0 6px 18px rgba(0,0,0,.18)',
            }}
          />
          {/* white backing + content as ONE box; rotation 0 carries no transform */}
          <div
            ref={ref}
            style={{
              position: 'absolute',
              left: contentLeft,
              top: contentTop,
              width: t.contentWidth,
              height: t.contentHeight,
              background: '#fff',
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {children}
          </div>
          {pageChrome}
        </PageProvider>
      </div>
      </ProjectorProvider>
    </DocumentScope>
  );
}
