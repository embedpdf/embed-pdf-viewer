/**
 * The projectors page surfaces give anchored UI: how a box on a page lands on screen right now
 * (a {@link ViewProjector}).
 *
 * - A Stage projects through its camera: pure state, no DOM reads, so the overlay and the pages
 *   update in the same render ({@link stageViewProjector}).
 * - A page shown on its own (a `PageView`) has no camera, so anchored UI is placed by measuring
 *   the page element in client space, portalled to `<body>` and positioned `fixed`, so no
 *   ancestor's overflow clips it ({@link clientPageProjector}).
 */
import type { AnchoredRect, PageViewEnv, ViewProjector } from './anchored-position';
import type { PageRef } from './page-ref';

/** The page transform members a projection reads; `PageTransform` satisfies it. */
export interface ProjectedTransform {
  readonly viewScale: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly zoom: number;
}

/**
 * The page surface a client projector measures: the page context's members. `transform` may be
 * the transform or a function that returns the current one (a signal).
 */
export interface ClientProjectedPage {
  readonly ref: PageRef;
  readonly transform: ProjectedTransform | (() => ProjectedTransform);
  toClientRect(rect: AnchoredRect): AnchoredRect;
  toClientPoint(point: { x: number; y: number }): { x: number; y: number };
}

/**
 * A client-space projector for one page. `mounted` says whether the page
 * element is in the document yet: until it is, every projection is `null`,
 * and the anchored UI waits for the first measurable pass. The view is the
 * window. Pair it with {@link observeClientGeometry}, which reports the
 * browser-driven moves (document scroll, window resize) no state announces.
 * Every member reads `page` when it runs, so a page context whose members
 * change keeps one projector.
 */
export function clientPageProjector(
  page: ClientProjectedPage,
  mounted: () => boolean,
): ViewProjector {
  const isThisPage = (other: PageRef) => other.objectNumber === page.ref.objectNumber;
  const transformOf = (): ProjectedTransform =>
    typeof page.transform === 'function' ? page.transform() : page.transform;
  return {
    space: 'client',
    toScreen: (other, rect) => (isThisPage(other) && mounted() ? page.toClientRect(rect) : null),
    toScreenPoint: (other, at) => (isThisPage(other) && mounted() ? page.toClientPoint(at) : null),
    viewEnv: (other): PageViewEnv | null => {
      if (!isThisPage(other)) return null;
      const transform = transformOf();
      return { scale: transform.viewScale, rotation: transform.rotation, zoom: transform.zoom };
    },
    view: () =>
      typeof document === 'undefined'
        ? null
        : {
            x: 0,
            y: 0,
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          },
  };
}

/** What a Stage projection reads from the Stage lens; `StageHostCapability` satisfies it. */
export interface StageProjection {
  pageRectToViewport(page: PageRef, rect: AnchoredRect): AnchoredRect | null;
  getPageFrame(page: PageRef): { readonly transform: ProjectedTransform } | null;
  getViewportSize(): { width: number; height: number };
}

/**
 * The Stage's projector: anchored UI positions through the camera, in the Stage's own box
 * (`'overlay'` space). `stage()` gives the lens when a projection runs, or null without one
 * (nothing projects then). It reads only the Stage's state, so the binding's revision (the
 * visible pages) is what tells anchored UI to place itself again, in the same render as the
 * pages.
 */
export function stageViewProjector(stage: () => StageProjection | null): ViewProjector {
  return {
    space: 'overlay',
    toScreen: (page, rect) => stage()?.pageRectToViewport(page, rect) ?? null,
    toScreenPoint: (page, at) => {
      const rect = stage()?.pageRectToViewport(page, { x: at.x, y: at.y, width: 0, height: 0 });
      return rect ? { x: rect.x, y: rect.y } : null;
    },
    viewEnv: (page) => {
      const transform = stage()?.getPageFrame(page)?.transform;
      return transform
        ? { scale: transform.viewScale, rotation: transform.rotation, zoom: transform.zoom }
        : null;
    },
    view: () => {
      const size = stage()?.getViewportSize();
      return size && size.width > 0 && size.height > 0 ? { x: 0, y: 0, ...size } : null;
    },
  };
}
