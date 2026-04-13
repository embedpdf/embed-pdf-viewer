import { Action } from '@embedpdf/core';

export const ADD_STAMP_LIBRARY = 'STAMP/ADD_LIBRARY';
export const REMOVE_STAMP_LIBRARY = 'STAMP/REMOVE_LIBRARY';

export interface AddStampLibraryAction extends Action {
  type: typeof ADD_STAMP_LIBRARY;
  payload: string;
}

export interface RemoveStampLibraryAction extends Action {
  type: typeof REMOVE_STAMP_LIBRARY;
  payload: string;
}

export type StampAction = AddStampLibraryAction | RemoveStampLibraryAction;

export function addStampLibrary(id: string): AddStampLibraryAction {
  return { type: ADD_STAMP_LIBRARY, payload: id };
}

export function removeStampLibrary(id: string): RemoveStampLibraryAction {
  return { type: REMOVE_STAMP_LIBRARY, payload: id };
}
