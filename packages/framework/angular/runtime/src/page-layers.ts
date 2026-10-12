/**
 * The Angular side of `@embedpdf/web`'s page layers: a layer says, for as long as it's there,
 * which part of its page it paints, and the render layer reads which parts are painted, to leave
 * them out of the page's picture.
 */
import {
  afterNextRender,
  effect,
  inject,
  Injector,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { pageLayersOf, type PagePart, type PaintedParts } from '@embedpdf/web';

/**
 * Say, for as long as this component is there, that it paints `part` of its page (`pageRef()`,
 * the page context's `ref`; `null` while it paints nothing). Call it in an injection context.
 */
export function paintsPagePart(pageRef: () => object | null, part: PagePart): void {
  effect((onCleanup) => {
    const ref = pageRef();
    if (ref) onCleanup(untracked(() => pageLayersOf(ref).paint(part)));
  });
}

/**
 * Which parts of the page (`pageRef()`, the page context's `ref`) the layers on it paint: `null`
 * until the first render is done, when every layer made with this one has said what it paints,
 * so the page's picture is never asked for with a part another layer is about to take. Call it
 * in an injection context.
 */
export function injectPaintedParts(pageRef: () => object): Signal<PaintedParts | null> {
  const painted = signal<PaintedParts | null>(null);
  const injector = inject(Injector);
  afterNextRender(() => {
    effect(
      (onCleanup) => {
        const layers = pageLayersOf(pageRef());
        untracked(() => painted.set(layers.painted()));
        onCleanup(layers.subscribe(() => painted.set(layers.painted())));
      },
      { injector },
    );
  });
  return painted.asReadonly();
}
