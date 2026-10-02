/**
 * What the annotation layer's parts read about their page: the plugin's host side for the page's
 * own document, and the page's view as signals that change only when what they hold does. A
 * Stage hands every page a new transform on every frame, also during a plain scroll, which moves
 * the page but changes nothing inside it; these keep a scroll from redrawing the annotations.
 */
import { computed, type Signal } from '@angular/core';
import { samePagePlacement, type PageTransform } from '@embedpdf/core-geometry';
import type { ViewEnv } from '@embedpdf/core-annotation';
import { CapabilityBinding, injectKernelHost, type EpdfPageContext } from '@embedpdf/angular/runtime';
import {
  AnnotationToken as AnnotationHostToken,
  type AnnotationHostCapability,
} from '@embedpdf/plugin-annotation/contract/host';

/**
 * The annotation plugin's host side (the reads only framework code has: items, chrome, text
 * boxes), for the document the page belongs to. Call it in an injection context.
 */
export function annotationHostOf(
  page: EpdfPageContext,
  what: string,
): CapabilityBinding<AnnotationHostCapability> {
  return new CapabilityBinding<AnnotationHostCapability>(
    injectKernelHost(what),
    () => AnnotationHostToken,
    () => page.documentId,
  );
}

/**
 * The page's zoom and turn, for the plugin's reads: it projects what keeps its size or stays
 * upright on screen (`noZoom`, `noRotate`). `zoom`, not `viewScale`: 1 is the page's 100%.
 */
export function pageViewOf(page: EpdfPageContext): Signal<ViewEnv> {
  return computed(
    () => {
      const transform = page.transform();
      return { zoom: transform.zoom, rotation: transform.rotation };
    },
    { equal: (left, right) => left.zoom === right.zoom && left.rotation === right.rotation },
  );
}

/** The page's transform for placing things in its pixels: the same while only a scroll moves it. */
export function pagePixelsOf(page: EpdfPageContext): Signal<PageTransform> {
  return computed(() => page.transform(), { equal: samePagePlacement });
}
