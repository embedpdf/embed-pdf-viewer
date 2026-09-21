/** Authority reads for the twins, the hydration gate, the fused fill
 *  projection and the write gate — one wildcard-aware helper. */
import { PluginError } from '@embedpdf/core';

import type { FormContext } from './context';

export function createAuthority(ctx: FormContext) {
  const can = (cap: 'doc.forms.read' | 'doc.forms.fill' | 'doc.forms.modify'): boolean =>
    ctx.doc?.security.allows(cap) ?? false;
  const assertFill = (operation: string): void => {
    // The optimistic gate: no fill authority → refuse BEFORE the spinner and
    // the queued engine call. (The fused projection renders such widgets
    // inert; this covers the imperative door.)
    if (!can('doc.forms.fill')) {
      throw new PluginError('permission-denied', 'form', `${operation} requires doc.forms.fill`, {
        details: { required: 'doc.forms.fill' },
      });
    }
  };
  return { can, assertFill };
}
export type FormAuthority = ReturnType<typeof createAuthority>;
