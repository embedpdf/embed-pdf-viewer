/**
 * <PageView> — a single page surface with no Stage.
 *
 * Same layers + rotation + chrome frame as a `<Stage>` page, but no
 * camera/scroll/zoom and, crucially, no dependency on `@embedpdf/plugin-stage`.
 * It builds its own `PageTransform` from a target content width and shares the
 * exact `PageContext` seam, so every layer (RenderLayer, AnnotationLayer, …)
 * works here identically — and it provides the measured `ViewProjector`, so
 * anchored UI (`<AnnotationMenu>`, `<SelectionMenu>`) works here too, portalled
 * and clipping-immune. With the interaction plugin registered it is also the
 * page's pointer surface, so tools (text selection, annotation editing) work in
 * it as they do on a Stage page.
 */
import * as React from 'react';
import { useId, useMemo, useRef } from 'react';
import { toPageRef } from '@embedpdf/core';
import type { PageRef } from '@embedpdf/core';
import { NO_FRAME, pageTransform, type PageFrame } from '@embedpdf/core-geometry';
import {
  clientPageProjector,
  makePageContext,
  observeClientGeometry,
  pageSurfaceLayout,
  pageViewTransformInput,
  paint,
} from '@embedpdf/web';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import {
  ProjectorProvider,
  ShownPagesProvider,
  type ProjectorBinding,
  type ShownPages,
  type ViewProjector,
} from './anchored';
import { PagePointerSource } from './interaction';
import {
  DocumentScope,
  PageProvider,
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  useViewerSettings,
} from './runtime';

/**
 * The page's pointer surface, when the interaction plugin is registered. It sits
 * below the layers, like the Stage's own listener: a press on a layer that lets
 * the pointer through (the picture, the selection highlight) reaches the tools,
 * and a control that takes its own presses (a link, a form field) keeps them.
 */
function PointerSurface() {
  const interaction = useOptionalCapability(InteractionHostToken);
  return interaction ? <PagePointerSource /> : null;
}

export interface PageViewProps {
  /** The page: its `ref`, which follows it when pages move, or its index, from 0. */
  page: PageRef | number;
  /** Which document to show. Defaults to the one a `<DocumentScope>` names, else the active one. */
  documentId?: string;
  /** Shown while the document or the page is not available yet (default: nothing). */
  fallback?: React.ReactNode;
  /** The width of the page, in pixels; the display box is the rotated footprint. Default 240. */
  width?: number;
  /** Space reserved around the page for your own labels, in pixels per side; the sides left out are 0. */
  pageFrame?: Partial<PageFrame>;
  /** Page-space content (rotates with the page). */
  children: React.ReactNode;
  /** Box-space chrome (label, border, …) — never rotated. Mirrors `<Stage pageChrome>`. */
  pageChrome?: React.ReactNode;
  /** On the outer box. */
  className?: string;
  /** On the outer box. */
  style?: React.CSSProperties;
}

/** A single page surface with no Stage — same layers + rotation + chrome frame,
 *  no camera/scroll/zoom. */
export function PageView({
  page: wanted,
  documentId,
  fallback = null,
  width = 240,
  pageFrame: framePatch,
  children,
  pageChrome,
  className,
  style,
}: PageViewProps) {
  const wantedRef = typeof wanted === 'number' ? null : wanted;
  const wantedIndex = typeof wanted === 'number' ? wanted : null;
  // The sides left out reserve nothing; memoized by value so the context stays stable.
  const { top = 0, right = 0, bottom = 0, left = 0 } = framePatch ?? NO_FRAME;
  const pageFrame = useMemo<PageFrame>(
    () => ({ top, right, bottom, left }),
    [top, right, bottom, left],
  );
  const inScope = useDocumentId();
  const ref = useRef<HTMLDivElement>(null);
  const docId = documentId ?? inScope;
  // The page-registry entry, subscribed: a rotate or a reorder re-renders
  // this surface like it re-renders a Stage page. Entries are reference-
  // stable per page in the registry, so identity is the right equality.
  const wantedPageObjectNumber = wantedRef?.objectNumber ?? null;
  const base = useKernelValue((kernel) => {
    if (!docId) return null;
    const pages = kernel.documents.listPages(docId);
    const found =
      wantedPageObjectNumber !== null
        ? pages.find((pageInfo) => pageInfo.ref.objectNumber === wantedPageObjectNumber)
        : pages[wantedIndex ?? 0];
    return found ?? null;
  });
  const page = base?.index ?? wantedIndex ?? 0;
  // The page's address is the kernel's (`PageLayout.ref`); a placeholder
  // (object number = 1-based index) only until the layout is known — the
  // surface renders the fallback before that anyway. Memoized by the number so
  // the context's `ref` stays identity-stable across re-renders (layers key
  // effects on it).
  const pageObjectNumber = base?.ref.objectNumber ?? wantedPageObjectNumber ?? page + 1;
  const pageRef = useMemo(() => toPageRef(pageObjectNumber), [pageObjectNumber]);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  // Standalone (no Stage/camera): build the page's transform from the target
  // content `width` directly. Memoized by value: a new registry entry for an
  // unchanged page keeps the transform.
  const transform = useMemo(
    () => pageTransform(pageViewTransformInput(base, width, dpr)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `base` by the values it gives
    [base?.size.width, base?.size.height, base?.userUnit, base?.rotation, width, dpr],
  );
  // This instance's view identity: two PageViews of the same page (a compare
  // strip) must plan rasters independently, like two stage lenses do.
  const viewId = useId();
  const ctx = useMemo(
    () =>
      makePageContext(docId ?? '', `page-view:${viewId}`, pageRef, page, pageFrame, transform, () =>
        ref.current!.getBoundingClientRect(),
      ),
    [docId, pageRef, page, pageFrame, transform, viewId],
  );
  // The PageView's ViewProjector: no camera, so anchored UI positions by
  // measuring the DOM (client space → portal + position:fixed, immune to
  // ancestor overflow clipping). `toScreen` answers null until the page
  // element has committed — <Anchored> forces one post-commit pass to pick
  // it up. The binding's revision covers state-driven changes (a new
  // transform/page); `observeClientGeometry` covers the genuinely
  // browser-driven ones (document scroll, window resize) that no state
  // change announces.
  const projector = useMemo<ViewProjector>(
    () => clientPageProjector(ctx, () => ref.current !== null),
    [ctx],
  );
  const projectorBinding = useMemo<ProjectorBinding>(
    () => ({ projector, revision: ctx, subscribe: observeClientGeometry }),
    [projector, ctx],
  );
  // A PageView shows its one page.
  const shownPages = useMemo<ShownPages>(
    () => new Set([ctx.ref.objectNumber]),
    [ctx.ref.objectNumber],
  );
  // The viewer's `page` settings; `--epdf-page-*` CSS variables win over them.
  const look = useViewerSettings((settings) => settings.page);
  if (!docId || !base) return <>{fallback}</>;
  // The outer box (page and frame), the shadow at the footprint, and the turned content box.
  const layout = pageSurfaceLayout(transform, pageFrame);
  return (
    <DocumentScope id={docId}>
      <ShownPagesProvider value={shownPages}>
        <ProjectorProvider value={projectorBinding}>
          <div
            className={className}
            style={{
              position: 'relative',
              width: layout.outer.width,
              height: layout.outer.height,
              ...style,
            }}
          >
            <PageProvider value={ctx}>
              {/* drop shadow ONLY — transparent, axis-aligned, can't leak behind the bitmap */}
              <div
                style={{
                  position: 'absolute',
                  ...layout.shadow,
                  boxShadow: paint('page-shadow', look.shadow),
                }}
              />
              {/* white backing + content as ONE box; rotation 0 carries no transform */}
              <div
                ref={ref}
                style={{
                  position: 'absolute',
                  ...layout.content,
                  background: paint('page-background', look.background),
                  transform: layout.turn ?? undefined,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              >
                <PointerSurface />
                {children}
              </div>
              {pageChrome}
            </PageProvider>
          </div>
        </ProjectorProvider>
      </ShownPagesProvider>
    </DocumentScope>
  );
}
