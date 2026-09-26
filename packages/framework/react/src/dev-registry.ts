/**
 * Development-time bookkeeping of which layers a page surface mounts, so a
 * layer can notice a wrong neighbour: a `<RenderLayer>` still baking
 * annotations under an `<AnnotationLayer>` (drawn twice), or a `<FormLayer>`
 * beside the form widget renderer (controls doubled). Keyed by the page
 * context object, which is identity-stable per surface. Production builds
 * keep the map but never warn (see `devWarn`).
 */
import { useEffect } from 'react';
import { devWarn, isDev } from './dev';

export interface PageLayerFacts {
  /** A `<RenderLayer>` is mounted and bakes annotations into the raster. */
  renderBakesAnnotations?: boolean;
  /** An `<AnnotationLayer>` is mounted, with these renderer entries. */
  annotationRenderers?: readonly object[] | null;
  /** A `<FormLayer>` is mounted. */
  formLayer?: boolean;
}

const facts = new WeakMap<object, PageLayerFacts>();

const check = (page: object): void => {
  const pageFacts = facts.get(page);
  if (!pageFacts) return;
  if (pageFacts.renderBakesAnnotations && pageFacts.annotationRenderers !== undefined) {
    devWarn(
      'render-layer-bakes-under-annotation-layer',
      '<RenderLayer> still bakes annotations into the page raster while an <AnnotationLayer> ' +
        'draws them too — pass `annotations={false}` to <RenderLayer> so they are not drawn twice.',
    );
  }
  if (
    pageFacts.formLayer &&
    pageFacts.annotationRenderers?.some(
      (renderer) => 'behavior' in renderer && renderer.behavior === 'form-widgets',
    )
  ) {
    devWarn(
      'form-layer-beside-widget-renderer',
      '<FormLayer> is mounted next to an <AnnotationLayer renderers={[formWidgetRenderer]}> — ' +
        'the fill controls would double up. Use one of the two per page.',
    );
  }
};

/** Publish one fact about this page while mounted; every publish re-checks. */
export function usePageLayerFact<K extends keyof PageLayerFacts>(
  page: object,
  key: K,
  value: PageLayerFacts[K],
): void {
  useEffect(() => {
    if (!isDev()) return;
    const current = facts.get(page) ?? {};
    facts.set(page, { ...current, [key]: value });
    check(page);
    return () => {
      const after = facts.get(page);
      if (!after) return;
      const { [key]: _gone, ...rest } = after;
      facts.set(page, rest);
    };
  }, [page, key, value]);
}
