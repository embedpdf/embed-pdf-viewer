/**
 * The Svelte side of `@embedpdf/web`'s page layers: a layer says, for as long as it lives, which
 * part of its page it paints, and the render layer reads which parts are painted, to leave them
 * out of the page's picture.
 */
import { untrack } from 'svelte';
import { pageLayersOf, type PagePart, type PaintedParts } from '@embedpdf/web';

/**
 * Say, for as long as this component lives, that it paints `part` of its page (`pageRef()`, the
 * page context's `ref`; `null` while it paints nothing). Said as the component starts, so a render
 * layer started alongside knows it by the time it's mounted.
 */
export function usePaintsPagePart(pageRef: () => object | null, part: PagePart): void {
  $effect.pre(() => {
    const ref = pageRef();
    if (!ref) return;
    return untrack(() => pageLayersOf(ref).paint(part));
  });
}

/**
 * Which parts of the page (`pageRef()`, the page context's `ref`) the layers on it paint: `null`
 * until this component is mounted, when every layer started with it has said what it paints, so
 * the page's picture is never asked for with a part another layer is about to take.
 */
export function usePaintedParts(pageRef: () => object): { readonly current: PaintedParts | null } {
  let painted = $state.raw<PaintedParts | null>(null);
  $effect(() => {
    const layers = pageLayersOf(pageRef());
    return untrack(() => {
      painted = layers.painted();
      return layers.subscribe(() => (painted = layers.painted()));
    });
  });
  return {
    get current() {
      return painted;
    },
  };
}
