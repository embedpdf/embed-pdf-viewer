/**
 * `init()` — the imperative mount, implemented ONCE and door-blind.
 *
 * Typed with the element's own (widest) config deliberately: a function that
 * accepts the wider config satisfies a narrower signature, so each door can
 * re-type this as ITS contract by plain assignment, no cast. The reverse does
 * not hold — parameter types are contravariant — which is why the shared
 * implementation lives at the widest type and the doors narrow from there.
 */
import type { ElementConfig } from './config';
import { EmbedPdfViewerElement } from './element';

/** Where the viewer mounts: an element or a selector. */
export interface MountTarget {
  target: HTMLElement | string;
}

export function initViewer(options: ElementConfig & MountTarget): EmbedPdfViewerElement {
  const { target, ...config } = options;
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new Error(`[embedpdf] init: target not found: ${String(target)}`);
  const element = document.createElement('embedpdf-viewer') as EmbedPdfViewerElement;
  element.config = config;
  host.appendChild(element);
  return element;
}
