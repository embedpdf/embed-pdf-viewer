import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageRenderViewport } from '../dto/PageRender';

/**
 * The engine's render-parameter policy.
 *
 * - `continuous` — any viewport renders exactly as requested. The LOCAL
 *   engine always answers this: rendering is in-process, there is no
 *   shared cache to protect.
 * - `lattice` — the deployment treats a finite set of `viewport.scale`
 *   points as durable, CDN-shared artifacts (SCALE-OUT WS2). Conforming
 *   requests hit shared bytes; off-lattice requests are computed but never
 *   persisted, and are REJECTED (400) when `enforced` is true.
 *
 * The SDK never conforms a request implicitly — the same `render.image`
 * call must not return different pixels on local vs cloud. Conformance is
 * the caller's visible choice via {@link snapViewportToPolicy}.
 */
export type EngineRenderPolicy =
  | { readonly kind: 'continuous' }
  | {
      readonly kind: 'lattice';
      readonly scales: readonly number[];
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
 * Conform a viewport to a render policy — the ONE snap implementation,
 * shared by every engine and plugin. Pure and explicit by design:
 *
 * - `continuous` → identity (local/cloud plugin code stays byte-identical).
 * - `lattice` → returns a `scale`-kind viewport at the smallest lattice
 *   point ≥ the requested detail (snap UP: always crisp, CSS downscales
 *   for free), capped at the largest point.
 * - `width`-kind requests convert through the page's width in PDF user
 *   units — pass `opts.pageWidth` (the caller has it from the layout);
 *   omitting it for a width viewport under a lattice policy is a
 *   programmer error and throws `InvalidArg`.
 */
export function snapViewportToPolicy(
  policy: EngineRenderPolicy,
  viewport: PageRenderViewport,
  opts?: { pageWidth?: number },
): PageRenderViewport {
  if (policy.kind === 'continuous') return viewport;
  if (policy.scales.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render policy has an empty scale lattice');
  }
  const scales = [...policy.scales].sort((a, b) => a - b);

  let requested: number;
  if (viewport.kind === 'scale') {
    requested = viewport.scale ?? 1;
  } else {
    const pageWidth = opts?.pageWidth;
    if (pageWidth === undefined || pageWidth <= 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'snapping a width viewport to a scale lattice requires opts.pageWidth',
      );
    }
    requested = viewport.width / pageWidth;
  }

  const snapped = scales.find((scale) => scale >= requested) ?? scales[scales.length - 1]!;
  return { kind: 'scale', scale: snapped };
}
