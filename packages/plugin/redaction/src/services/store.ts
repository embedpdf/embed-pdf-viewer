/** The page registry reads and the engine's redaction service. */
import { PluginError, memo, type DocCapability, type PageRef } from '@embedpdf/core';

import type { RedactionContext } from './context';

/** Applying destroys content: its own granted power, narrower than annotate.
 *  The engine's apply asserts all three (the local redaction service and the
 *  cloud route guards alike): the redact grant itself, the page-content
 *  rewrite, and the annotation consumption. `canApply` mirrors the full set. */
export const APPLY_CAPABILITIES: readonly DocCapability[] = [
  'doc.redact',
  'doc.pages.modify',
  'doc.annotate.modify',
];

export function createStore(ctx: RedactionContext) {
  const requireService = () => {
    const service = ctx.doc.redaction;
    if (!service) {
      throw new PluginError('unsupported', 'redaction', 'this engine has no redaction service');
    }
    return service;
  };
  /** Every page's ref, in display order. */
  const pages = (): PageRef[] => (ctx.document()?.pages ?? []).map((page) => page.ref);
  /** Page object number → display index, rebuilt only when the page registry changes. */
  const indexByPage = memo(
    () => [ctx.document()?.pages] as const,
    (layouts) => new Map((layouts ?? []).map((page) => [page.ref.pageObjectNumber, page.index])),
  );
  const pageIndexOf = (page: PageRef): number => indexByPage().get(page.pageObjectNumber) ?? -1;
  const canApply = (): boolean =>
    ctx.doc.redaction !== undefined &&
    APPLY_CAPABILITIES.every((capability) => ctx.doc.security.allows(capability));
  return { requireService, pages, pageIndexOf, canApply };
}
export type RedactionStore = ReturnType<typeof createStore>;
