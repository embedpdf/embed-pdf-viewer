/**
 * Development-time bookkeeping of which layers a page surface mounts, so a
 * layer can notice a wrong neighbour: a `<RenderLayer>` still baking
 * annotations under an `<AnnotationLayer>` (drawn twice). Keyed by an object
 * that is the same for the surface's life (the page ref `usePage()` returns).
 * Production builds keep the map but never warn (see `devWarn`).
 */
import { toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
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
        'draws them too — pass `:annotations="false"` to <RenderLayer> so they are not drawn twice.',
    );
  }
};

/** Publish one fact about this page while the component lives; every publish re-checks. */
export function usePageLayerFact<Key extends keyof PageLayerFacts>(
  page: object,
  key: Key,
  value: MaybeRefOrGetter<PageLayerFacts[Key]>,
): void {
  if (!isDev()) return;
  watch(
    () => toValue(value),
    (current, _previous, onCleanup) => {
      facts.set(page, { ...facts.get(page), [key]: current });
      check(page);
      onCleanup(() => {
        const after = facts.get(page);
        if (!after) return;
        const { [key]: _gone, ...rest } = after;
        facts.set(page, rest);
      });
    },
    { immediate: true },
  );
}
