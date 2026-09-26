/** Slice reads and the engine doors. */
import { PluginError, type DocCapability } from '@embedpdf/core';

import type { RedactionContext } from './context';

/** Applying destroys content — its own granted power, narrower than annotate.
 *  The engine's apply asserts all three (LocalDocumentRedactionService; the
 *  cloud route guards match): the redact grant itself, the page-content
 *  rewrite, and the annotation consumption. `canApply` mirrors the full set. */
export const APPLY_CAPABILITIES: readonly DocCapability[] = [
  'doc.redact',
  'doc.pages.modify',
  'doc.annotate.modify',
];

export function createStore(ctx: RedactionContext) {
  const state = () => ctx.getState();
  const requireDoc = () => {
    const doc = ctx.doc;
    if (!doc) throw new PluginError('not-ready', 'redaction', 'no document bound');
    return doc;
  };
  const requireService = () => {
    const doc = requireDoc();
    if (!doc.redaction) {
      throw new PluginError('unsupported', 'redaction', 'this engine has no redaction service');
    }
    return doc.redaction;
  };
  /** Every page's ref, in display order. */
  const pages = () => (ctx.document()?.pages ?? []).map((p) => p.ref);
  const pageIndexOf = (pon: number): number =>
    ctx.document()?.pages.find((p) => p.ref.pageObjectNumber === pon)?.index ?? -1;
  const canApply = (): boolean => {
    const doc = ctx.doc;
    if (!doc || doc.redaction === undefined) return false;
    return APPLY_CAPABILITIES.every((cap) => doc.security.allows(cap));
  };
  return { state, requireDoc, requireService, pages, pageIndexOf, canApply };
}
export type RedactionStore = ReturnType<typeof createStore>;
