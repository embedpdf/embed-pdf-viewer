/**
 * The Vue side of `@embedpdf/web`'s page layers: a layer says, for as long as
 * it lives, which part of its page it paints, and the render layer reads which
 * parts are painted, to leave them out of the page's picture.
 */
import { onMounted, shallowRef, watch } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import { pageLayersOf, type PagePart, type PaintedParts } from '@embedpdf/web';

/**
 * Say, for as long as this component lives, that it paints `part` of its page
 * (`pageRef`, the page context's `ref`; `null` while it paints nothing). Said
 * at setup, so a render layer set up alongside knows it by the time it's
 * mounted.
 */
export function usePaintsPagePart(pageRef: Readonly<Ref<object | null>>, part: PagePart): void {
  watch(
    pageRef,
    (ref, _previous, onCleanup) => {
      if (ref) onCleanup(pageLayersOf(ref).paint(part));
    },
    { immediate: true },
  );
}

/**
 * Which parts of the page (`pageRef`, the page context's `ref`) the layers on
 * it paint: `null` until this component is mounted, when every layer set up
 * with it has said what it paints, so the page's picture is never asked for
 * with a part another layer is about to take.
 */
export function usePaintedParts(
  pageRef: Readonly<Ref<object>>,
): Readonly<ShallowRef<PaintedParts | null>> {
  const painted = shallowRef<PaintedParts | null>(null);
  onMounted(() => {
    watch(
      pageRef,
      (ref, _previous, onCleanup) => {
        const layers = pageLayersOf(ref);
        painted.value = layers.painted();
        onCleanup(layers.subscribe(() => (painted.value = layers.painted())));
      },
      { immediate: true },
    );
  });
  return painted;
}
