/**
 * Development-time bookkeeping of which layers a page surface mounts, so a layer can notice a
 * wrong neighbour: a `<RenderLayer>` still baking annotations under an `<AnnotationLayer>`
 * (drawn twice). Keyed by the page context object, which is the same for a surface's lifetime.
 * Production builds keep the map but never warn (see `devWarn`).
 */
import { devWarn, isDev } from './dev';

export interface PageLayerFacts {
  /** A `<RenderLayer>` is mounted and bakes annotations into the raster. */
  renderBakesAnnotations?: boolean;
  /** An `<AnnotationLayer>` is mounted, with these renderer entries. */
  annotationRenderers?: readonly object[] | null;
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
};

/**
 * Publish one fact about this page while the component lives; every publish checks again.
 * `value` is a function, so a fact that follows a prop stays current.
 */
export function usePageLayerFact<K extends keyof PageLayerFacts>(
  page: object,
  key: K,
  value: () => PageLayerFacts[K],
): void {
  $effect(() => {
    if (!isDev()) return;
    const current = facts.get(page) ?? {};
    facts.set(page, { ...current, [key]: value() });
    check(page);
    return () => {
      const after = facts.get(page);
      if (!after) return;
      const { [key]: _gone, ...rest } = after;
      facts.set(page, rest);
    };
  });
}
