/** Reads of the slice, the busy bracket, and the engine doors every area needs. */
import { PluginError, type ResourceStatus } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import type { SignatureContext } from './context';

export const sameRef = (a: FormFieldRef, b: FormFieldRef): boolean =>
  a.kind === 'objectNumber' && b.kind === 'objectNumber'
    ? a.fieldObjectNumber === b.fieldObjectNumber
    : a.kind === 'fqn' && b.kind === 'fqn'
      ? a.name === b.name
      : false;

export function createStore(ctx: SignatureContext) {
  const state = () => ctx.getState();
  const setStatus = (status: ResourceStatus): void => ctx.dispatch({ type: 'STATUS', status });
  const withBusy = async <T>(work: () => Promise<T>): Promise<T> => {
    ctx.dispatch({ type: 'BUSY', busy: true });
    try {
      return await work();
    } finally {
      ctx.dispatch({ type: 'BUSY', busy: false });
    }
  };
  const requireDoc = () => {
    const doc = ctx.doc;
    if (!doc) throw new PluginError('not-ready', 'signature', 'no document bound');
    return doc;
  };
  const requireSignatures = () => {
    const doc = requireDoc();
    if (!doc.signatures) {
      throw new PluginError(
        'unsupported',
        'signature',
        'this engine does not implement signatures',
      );
    }
    return { doc, signatures: doc.signatures };
  };
  const documentId = () => {
    const id = ctx.documentId;
    if (!id) throw new PluginError('not-ready', 'signature', 'no document id');
    return id;
  };
  return { state, setStatus, withBusy, requireDoc, requireSignatures, documentId };
}
export type SignatureStore = ReturnType<typeof createStore>;
