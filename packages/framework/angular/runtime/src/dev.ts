/**
 * Development-time guardrails. Each warning fires once (by key), says what is wrong and what to
 * do instead, and stays quiet in production builds (Angular's `isDevMode()`).
 *
 * The page layer facts let a layer notice a wrong neighbour on its page: a render layer still
 * baking annotations into the picture under an annotation layer, which draws them twice. Facts
 * are kept per page context, which is one object for as long as the page is shown.
 */
import { DestroyRef, effect, inject, isDevMode } from '@angular/core';
import type { EpdfPageContext } from './page-context';

const warned = new Set<string>();

/** Warn once per key. Quiet in production. */
export function devWarn(key: string, message: string): void {
  if (!isDevMode() || warned.has(key)) return;
  warned.add(key);
  console.warn(`[embedpdf] ${message}`);
}

/** For tests: forget every warning, so one can fire again. */
export function resetDevWarnings(): void {
  warned.clear();
}

export interface PageLayerFacts {
  /** An `<epdf-render-layer>` is on the page and bakes annotations into its picture. */
  renderBakesAnnotations?: boolean;
  /** An `<epdf-annotation-layer>` is on the page, with these custom drawings. */
  annotationRenderers?: readonly object[] | null;
}

const facts = new WeakMap<object, PageLayerFacts>();

const check = (page: object): void => {
  const pageFacts = facts.get(page);
  if (pageFacts?.renderBakesAnnotations && pageFacts.annotationRenderers !== undefined) {
    devWarn(
      'render-layer-bakes-under-annotation-layer',
      '<epdf-render-layer> still bakes annotations into the page picture while an ' +
        '<epdf-annotation-layer> draws them too: set [annotations]="false" on ' +
        '<epdf-render-layer> so they are not drawn twice.',
    );
  }
};

/**
 * Tell the page's other layers one fact about this layer, for as long as it's there; `value`
 * is read again whenever its signals change. Call it in an injection context.
 */
export function publishPageLayerFact<Key extends keyof PageLayerFacts>(
  page: EpdfPageContext,
  key: Key,
  value: () => PageLayerFacts[Key],
): void {
  if (!isDevMode()) return;
  effect(() => {
    facts.set(page, { ...facts.get(page), [key]: value() });
    check(page);
  });
  inject(DestroyRef).onDestroy(() => {
    const current = facts.get(page);
    if (!current) return;
    const { [key]: _gone, ...rest } = current;
    facts.set(page, rest);
  });
}
