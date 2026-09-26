/** Authority reads for the twins, the fields mirror, the fill projection and the write gate. */
import { PluginError } from '@embedpdf/core';

import type { FormContext } from './context';

export type FormDocCapability = 'doc.forms.read' | 'doc.forms.fill' | 'doc.forms.modify';

export function createAuthority(ctx: FormContext) {
  const can = (capability: FormDocCapability): boolean => ctx.doc.security.allows(capability);
  /**
   * Refuse a fill before any in-flight marker or engine call. The fill
   * projection already renders such widgets inert; this covers the
   * programmatic verbs.
   */
  const assertFill = (operation: string): void => {
    if (!can('doc.forms.fill')) {
      throw new PluginError('permission-denied', 'form', `${operation} requires doc.forms.fill`, {
        details: { required: 'doc.forms.fill' },
      });
    }
  };
  return { can, assertFill };
}
export type FormAuthority = ReturnType<typeof createAuthority>;
