import { Action } from '@embedpdf/core';

export const ADD_SIGNATURE_ENTRY = 'SIGNATURE/ADD_ENTRY';
export const REMOVE_SIGNATURE_ENTRY = 'SIGNATURE/REMOVE_ENTRY';

export interface AddSignatureEntryAction extends Action {
  type: typeof ADD_SIGNATURE_ENTRY;
  payload: string;
}

export interface RemoveSignatureEntryAction extends Action {
  type: typeof REMOVE_SIGNATURE_ENTRY;
  payload: string;
}

export type SignatureAction = AddSignatureEntryAction | RemoveSignatureEntryAction;

export function addSignatureEntry(id: string): AddSignatureEntryAction {
  return { type: ADD_SIGNATURE_ENTRY, payload: id };
}

export function removeSignatureEntry(id: string): RemoveSignatureEntryAction {
  return { type: REMOVE_SIGNATURE_ENTRY, payload: id };
}
