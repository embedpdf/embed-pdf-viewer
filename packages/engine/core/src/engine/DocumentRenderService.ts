import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageRenderViewport } from '../dto/PageRender';

/**
 * The engine's render-parameter policy.
 *
 * - `continuous` — any viewport renders exactly as requested. The LOCAL
 *   engine always answers this: rendering is in-process, there is no
 *   shared cache to protect, and exactness is the local product promise.
 * - `lattice` — the deployment treats a finite set of render points as
 *   durable, CDN-shared artifacts (SCALE-OUT WS2). The bounded quantity
 *   is OUTPUT PIXELS, never zoom:
 *
 *   - `fullPage.widths` — full-page renders quantize on `viewport.width`
 *     (a scale lattice bounds artifact COUNT but not SIZE: PDF page space
 *     is effectively unbounded, so scale 1 of a poster page is a memory
 *     bomb while width caps the dominant dimension by construction).
 *   - `tiles` — RESERVED for the deep-zoom vertical: a scale-based
 *     pyramid × fixed tile size, where per-job cost is constant. Absent
 *     until the tiling plugin ships; reserving the shape keeps the SDK
 *     contract from churning twice.
 *   - `maxRenderPixels` — the worker-side output budget for degenerate
 *     geometry (width bounds width, not height).
 *
 * The SDK never conforms a request implicitly — the same `render.image`
 * call must not return different pixels on local vs cloud. Conformance is
 * the caller's visible choice via {@link snapViewportToPolicy}.
 */
export type EngineRenderPolicy =
  | { readonly kind: 'continuous' }
  | {
      readonly kind: 'lattice';
      readonly fullPage: { readonly widths: readonly number[] };
      readonly tiles?: {
        readonly tileSizes: readonly number[];
        readonly scales: readonly number[];
      };
      readonly maxRenderPixels?: number;
      readonly formats: readonly ('webp' | 'png')[];
      readonly background: 'white';
      readonly enforced: boolean;
    };

export const CONTINUOUS_RENDER_POLICY: EngineRenderPolicy = { kind: 'continuous' };

/**
 * Document-scoped render policy surface (`doc.render`). Async because the
 * cloud engine learns its policy from `/v1/access`; the local engine
 * resolves immediately with `continuous`.
 *
 * Per-page rendering itself stays on `page(pon).render` — this service
 * carries POLICY, not pixels.
 */
export interface DocumentRenderService {
  policy(): Promise<EngineRenderPolicy>;
}

/**
 * Conform a FULL-PAGE viewport to a render policy — the ONE snap
 * implementation, shared by every engine and plugin. Pure and explicit
 * by design:
 *
 * - `continuous` → identity (local/cloud plugin code stays byte-identical).
 * - `lattice` → returns a `width`-kind viewport at the smallest ladder
 *   width ≥ the requested detail (snap UP: always crisp, CSS downscales
 *   for free), capped at the largest width — detail beyond the cap is the
 *   tile pyramid's job, by design.
 * - `scale`-kind requests convert through the page's width in PDF user
 *   units — pass `opts.pageWidth` (the caller has it from the layout);
 *   omitting it for a scale viewport under a lattice policy is a
 *   programmer error and throws `InvalidArg`.
 */
export function snapViewportToPolicy(
  policy: EngineRenderPolicy,
  viewport: PageRenderViewport,
  opts?: { pageWidth?: number },
): PageRenderViewport {
  if (policy.kind === 'continuous') return viewport;
  if (policy.fullPage.widths.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render policy has an empty width ladder');
  }
  const widths = [...policy.fullPage.widths].sort((a, b) => a - b);

  let requested: number;
  if (viewport.kind === 'width') {
    requested = viewport.width;
  } else {
    const pageWidth = opts?.pageWidth;
    if (pageWidth === undefined || pageWidth <= 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'snapping a scale viewport to a width lattice requires opts.pageWidth',
      );
    }
    requested = (viewport.scale ?? 1) * pageWidth;
  }

  const snapped = widths.find((width) => width >= requested) ?? widths[widths.length - 1]!;
  return { kind: 'width', width: snapped };
}
