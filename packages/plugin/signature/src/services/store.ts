/** The busy bracket and the engine doors every area needs. */
import { PluginError } from '@embedpdf/core';

import { setBusy } from '../model';
import type { SignatureContext } from './context';

export function createStore(ctx: SignatureContext) {
  const withBusy = async <T>(work: () => Promise<T>): Promise<T> => {
    ctx.state.update(setBusy, true);
    try {
      return await work();
    } finally {
      ctx.state.update(setBusy, false);
    }
  };
  const requireSignatures = () => {
    const signatures = ctx.doc.signatures;
    if (!signatures) {
      throw new PluginError(
        'unsupported',
        'signature',
        'this engine does not implement signatures',
      );
    }
    return signatures;
  };
  const documentId = () => {
    const id = ctx.documentId;
    if (!id) throw new PluginError('not-ready', 'signature', 'no document id');
    return id;
  };
  return { withBusy, requireSignatures, documentId };
}
export type SignatureStore = ReturnType<typeof createStore>;
