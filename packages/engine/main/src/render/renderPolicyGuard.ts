import {
  EngineError,
  EngineErrorCode,
  type AnnotationAppearanceRenderOptions,
  type EngineRenderPolicy,
  type PageRenderOptions,
} from '@embedpdf/engine-core/runtime';

/**
 * Local mirror of the server's render-lattice enforcement.
 *
 * A `localEngine({ renderPolicy })` deployment opts the local engine into
 * the SAME policy discipline the cloud advertises over `/v1/access`:
 *
 *   - BUDGET (always, lattice or not enforced): `maxRenderPixels` rides
 *     into every worker render as `maxOutputPixels`, so the rasterizer
 *     rejects BEFORE allocating — a page-sized stamp at scale 40 fails
 *     fast instead of OOM-killing the tab. A caller-supplied budget can
 *     only tighten the deployment's, never loosen it (min wins).
 *   - ENFORCEMENT (`enforced: true` only): off-lattice requests are
 *     rejected with the same InvalidArg + `renderPolicy` details the
 *     enforcing server returns, so conformance bugs surface in dev
 *     against a local engine instead of in prod against the CDN plane.
 *     Scoping mirrors the server: full-page renders must use a ladder
 *     width (rect targets are the future tile policy's jurisdiction and
 *     stay exempt); appearance scales must sit on the appearance lattice
 *     when the policy declares one.
 *
 * The DEFAULT local policy remains `continuous` — every check here is the
 * identity unless the embedder configured a lattice.
 */

/** Fold the deployment's pixel budget into page-render worker options. */
export function withRenderBudget(
  policy: EngineRenderPolicy,
  options: PageRenderOptions | undefined,
): PageRenderOptions | undefined {
  return foldBudget(policy, options);
}

/** Fold the deployment's pixel budget into appearance worker options. */
export function withAppearanceBudget(
  policy: EngineRenderPolicy,
  options: AnnotationAppearanceRenderOptions | undefined,
): AnnotationAppearanceRenderOptions | undefined {
  return foldBudget(policy, options);
}

function foldBudget<T extends { maxOutputPixels?: number }>(
  policy: EngineRenderPolicy,
  options: T | undefined,
): T | undefined {
  if (policy.kind !== 'lattice' || policy.maxRenderPixels === undefined) return options;
  const budget =
    options?.maxOutputPixels !== undefined
      ? Math.min(options.maxOutputPixels, policy.maxRenderPixels)
      : policy.maxRenderPixels;
  return { ...(options ?? ({} as T)), maxOutputPixels: budget };
}

/**
 * Enforced-lattice check for a FULL-PAGE render. Throws the same
 * InvalidArg-with-policy the enforcing server's 400 carries. Rect
 * targets pass untouched because they belong to the tile policy.
 */
export function assertFullPageOnLattice(
  policy: EngineRenderPolicy,
  options: PageRenderOptions | undefined,
): void {
  if (policy.kind !== 'lattice' || !policy.enforced) return;
  const fullPage = options?.target === undefined || options.target.kind === 'page';
  if (!fullPage) return;
  const viewport = options?.viewport;
  const width = viewport?.kind === 'width' ? viewport.width : undefined;
  if (width !== undefined && policy.fullPage.widths.includes(width)) return;
  rejectOffLattice(policy, 'use snapFullPageViewport(policy, viewport, { pageWidth })');
}

/**
 * Enforced-lattice check for an appearance batch. Only applies when the
 * policy declares an appearance lattice — a lattice without one leaves
 * appearance scales unbounded (the budget still applies).
 */
export function assertAppearanceOnLattice(
  policy: EngineRenderPolicy,
  options: AnnotationAppearanceRenderOptions | undefined,
): void {
  if (policy.kind !== 'lattice' || !policy.enforced || policy.appearances === undefined) return;
  const scale = options?.scale ?? 1;
  if (policy.appearances.scales.includes(scale)) return;
  rejectOffLattice(policy, 'use snapAppearanceScale(policy, scale)');
}

function rejectOffLattice(policy: EngineRenderPolicy, hint: string): never {
  throw new EngineError(
    EngineErrorCode.InvalidArg,
    `render request is off the deployment lattice (see renderPolicy; ${hint})`,
    { details: { renderPolicy: policy } },
  );
}
