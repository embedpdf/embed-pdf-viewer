import type { DocumentManifest, LayerScopePlane } from '@embedpdf/engine-core/wire';

/**
 * Plane-scope resolution — THE one rule every cloud service uses to pick a
 * path family: a read resolves at the DOC-LEVEL (shared base) path iff EVERY
 * plane it depends on is inherited (`'base'`) by this layer. One owned plane
 * → the layer-scoped path.
 *
 * Absent `scopes` (base manifests never carry it; pre-plane servers omit
 * it) means layer paths — never wrong, only unshared.
 */
export function planesInherited(
  manifest: DocumentManifest,
  planes: readonly LayerScopePlane[],
): boolean {
  const scopes = manifest.scopes;
  if (!scopes) return false;
  return planes.every((plane) => scopes[plane] === 'base');
}
