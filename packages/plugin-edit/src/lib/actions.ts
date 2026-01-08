import { Action } from '@embedpdf/core';
import {
  PdfTextBlock,
  Position,
  PdfLayoutSummary,
  PdfWord,
  PdfLine,
  PdfColumn,
  PdfTable,
} from '@embedpdf/models';
import { DetectionStatus, EditDocumentState, EditPageState } from './types';

// ─────────────────────────────────────────────────────────
// Action Types
// ─────────────────────────────────────────────────────────

export const INIT_EDIT_STATE = 'EDIT/INIT_STATE';
export const CLEANUP_EDIT_STATE = 'EDIT/CLEANUP_STATE';
export const INIT_PAGE_STATE = 'EDIT/INIT_PAGE_STATE';
export const SET_DETECTION_STATUS = 'EDIT/SET_DETECTION_STATUS';
export const SET_TEXT_BLOCKS = 'EDIT/SET_TEXT_BLOCKS';
export const SET_LAYOUT_DATA = 'EDIT/SET_LAYOUT_DATA';
export const SELECT_BLOCK = 'EDIT/SELECT_BLOCK';
export const DESELECT_BLOCK = 'EDIT/DESELECT_BLOCK';
export const SET_BLOCK_OFFSET = 'EDIT/SET_BLOCK_OFFSET';
export const CLEAR_BLOCK_OFFSET = 'EDIT/CLEAR_BLOCK_OFFSET';
export const CLEAR_ALL_OFFSETS = 'EDIT/CLEAR_ALL_OFFSETS';

// ─────────────────────────────────────────────────────────
// Action Interfaces
// ─────────────────────────────────────────────────────────

export interface InitEditStateAction extends Action {
  type: typeof INIT_EDIT_STATE;
  payload: {
    documentId: string;
    state: EditDocumentState;
  };
}

export interface CleanupEditStateAction extends Action {
  type: typeof CLEANUP_EDIT_STATE;
  payload: string; // documentId
}

export interface InitPageStateAction extends Action {
  type: typeof INIT_PAGE_STATE;
  payload: {
    documentId: string;
    pageIndex: number;
    state: EditPageState;
  };
}

export interface SetDetectionStatusAction extends Action {
  type: typeof SET_DETECTION_STATUS;
  payload: {
    documentId: string;
    pageIndex: number;
    status: DetectionStatus;
  };
}

export interface SetTextBlocksAction extends Action {
  type: typeof SET_TEXT_BLOCKS;
  payload: {
    documentId: string;
    pageIndex: number;
    blocks: PdfTextBlock[];
  };
}

export interface SetLayoutDataAction extends Action {
  type: typeof SET_LAYOUT_DATA;
  payload: {
    documentId: string;
    pageIndex: number;
    layoutSummary: PdfLayoutSummary;
    words: PdfWord[];
    lines: PdfLine[];
    columns: PdfColumn[];
    tables: PdfTable[];
  };
}

export interface SelectBlockAction extends Action {
  type: typeof SELECT_BLOCK;
  payload: {
    documentId: string;
    pageIndex: number;
    blockIndex: number;
  };
}

export interface DeselectBlockAction extends Action {
  type: typeof DESELECT_BLOCK;
  payload: {
    documentId: string;
  };
}

export interface SetBlockOffsetAction extends Action {
  type: typeof SET_BLOCK_OFFSET;
  payload: {
    documentId: string;
    pageIndex: number;
    blockIndex: number;
    offset: Position;
  };
}

export interface ClearBlockOffsetAction extends Action {
  type: typeof CLEAR_BLOCK_OFFSET;
  payload: {
    documentId: string;
    pageIndex: number;
    blockIndex: number;
  };
}

export interface ClearAllOffsetsAction extends Action {
  type: typeof CLEAR_ALL_OFFSETS;
  payload: {
    documentId: string;
    pageIndex: number;
  };
}

// ─────────────────────────────────────────────────────────
// Action Union
// ─────────────────────────────────────────────────────────

export type EditAction =
  | InitEditStateAction
  | CleanupEditStateAction
  | InitPageStateAction
  | SetDetectionStatusAction
  | SetTextBlocksAction
  | SetLayoutDataAction
  | SelectBlockAction
  | DeselectBlockAction
  | SetBlockOffsetAction
  | ClearBlockOffsetAction
  | ClearAllOffsetsAction;

// ─────────────────────────────────────────────────────────
// Action Creators
// ─────────────────────────────────────────────────────────

export const initEditState = (
  documentId: string,
  state: EditDocumentState,
): InitEditStateAction => ({
  type: INIT_EDIT_STATE,
  payload: { documentId, state },
});

export const cleanupEditState = (documentId: string): CleanupEditStateAction => ({
  type: CLEANUP_EDIT_STATE,
  payload: documentId,
});

export const initPageState = (
  documentId: string,
  pageIndex: number,
  state: EditPageState,
): InitPageStateAction => ({
  type: INIT_PAGE_STATE,
  payload: { documentId, pageIndex, state },
});

export const setDetectionStatus = (
  documentId: string,
  pageIndex: number,
  status: DetectionStatus,
): SetDetectionStatusAction => ({
  type: SET_DETECTION_STATUS,
  payload: { documentId, pageIndex, status },
});

export const setTextBlocks = (
  documentId: string,
  pageIndex: number,
  blocks: PdfTextBlock[],
): SetTextBlocksAction => ({
  type: SET_TEXT_BLOCKS,
  payload: { documentId, pageIndex, blocks },
});

export const setLayoutData = (
  documentId: string,
  pageIndex: number,
  layoutSummary: PdfLayoutSummary,
  words: PdfWord[],
  lines: PdfLine[],
  columns: PdfColumn[],
  tables: PdfTable[],
): SetLayoutDataAction => ({
  type: SET_LAYOUT_DATA,
  payload: { documentId, pageIndex, layoutSummary, words, lines, columns, tables },
});

export const selectBlock = (
  documentId: string,
  pageIndex: number,
  blockIndex: number,
): SelectBlockAction => ({
  type: SELECT_BLOCK,
  payload: { documentId, pageIndex, blockIndex },
});

export const deselectBlock = (documentId: string): DeselectBlockAction => ({
  type: DESELECT_BLOCK,
  payload: { documentId },
});

export const setBlockOffset = (
  documentId: string,
  pageIndex: number,
  blockIndex: number,
  offset: Position,
): SetBlockOffsetAction => ({
  type: SET_BLOCK_OFFSET,
  payload: { documentId, pageIndex, blockIndex, offset },
});

export const clearBlockOffset = (
  documentId: string,
  pageIndex: number,
  blockIndex: number,
): ClearBlockOffsetAction => ({
  type: CLEAR_BLOCK_OFFSET,
  payload: { documentId, pageIndex, blockIndex },
});

export const clearAllOffsets = (documentId: string, pageIndex: number): ClearAllOffsetsAction => ({
  type: CLEAR_ALL_OFFSETS,
  payload: { documentId, pageIndex },
});
