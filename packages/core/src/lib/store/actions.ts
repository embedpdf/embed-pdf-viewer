import { PdfDocumentObject, PdfErrorCode, PdfPageObject, Rotation } from '@embedpdf/models';

// Document lifecycle actions
export const START_LOADING_DOCUMENT = 'START_LOADING_DOCUMENT';
export const UPDATE_DOCUMENT_LOADING_PROGRESS = 'UPDATE_DOCUMENT_LOADING_PROGRESS';
export const SET_DOCUMENT_LOADED = 'SET_DOCUMENT_LOADED';
export const SET_DOCUMENT_ERROR = 'SET_DOCUMENT_ERROR';
export const RETRY_LOADING_DOCUMENT = 'RETRY_LOADING_DOCUMENT';
export const CLOSE_DOCUMENT = 'CLOSE_DOCUMENT';
export const SET_ACTIVE_DOCUMENT = 'SET_ACTIVE_DOCUMENT';

// Document-specific actions
export const REFRESH_DOCUMENT = 'REFRESH_DOCUMENT';
export const REFRESH_PAGES = 'REFRESH_PAGES';
export const SET_PAGES = 'SET_PAGES';
export const SET_SCALE = 'SET_SCALE';
export const SET_ROTATION = 'SET_ROTATION';

// Global default actions
export const SET_DEFAULT_SCALE = 'SET_DEFAULT_SCALE';
export const SET_DEFAULT_ROTATION = 'SET_DEFAULT_ROTATION';

export const CORE_ACTION_TYPES = [
  START_LOADING_DOCUMENT,
  UPDATE_DOCUMENT_LOADING_PROGRESS,
  SET_DOCUMENT_LOADED,
  CLOSE_DOCUMENT,
  SET_ACTIVE_DOCUMENT,
  SET_DOCUMENT_ERROR,
  RETRY_LOADING_DOCUMENT,
  REFRESH_DOCUMENT,
  REFRESH_PAGES,
  SET_PAGES,
  SET_SCALE,
  SET_ROTATION,
  SET_DEFAULT_SCALE,
  SET_DEFAULT_ROTATION,
] as const;

// ─────────────────────────────────────────────────────────
// Document Lifecycle Actions
// ─────────────────────────────────────────────────────────

export interface StartLoadingDocumentAction {
  type: typeof START_LOADING_DOCUMENT;
  payload: {
    documentId: string;
    name?: string;
    scale?: number;
    rotation?: Rotation;
    passwordProvided?: boolean;
  };
}

export interface UpdateDocumentLoadingProgressAction {
  type: typeof UPDATE_DOCUMENT_LOADING_PROGRESS;
  payload: {
    documentId: string;
    progress: number;
  };
}

export interface SetDocumentLoadedAction {
  type: typeof SET_DOCUMENT_LOADED;
  payload: {
    documentId: string;
    document: PdfDocumentObject;
  };
}

export interface SetDocumentErrorAction {
  type: typeof SET_DOCUMENT_ERROR;
  payload: {
    documentId: string;
    error: string;
    errorCode?: PdfErrorCode;
    errorDetails?: any;
  };
}

export interface RetryLoadingDocumentAction {
  type: typeof RETRY_LOADING_DOCUMENT;
  payload: {
    documentId: string;
    passwordProvided?: boolean;
  };
}

export interface CloseDocumentAction {
  type: typeof CLOSE_DOCUMENT;
  payload: {
    documentId: string;
    nextActiveDocumentId?: string | null; // Optional: what to activate next
  };
}

export interface SetActiveDocumentAction {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId or null
}

// ─────────────────────────────────────────────────────────
// Document-Specific Actions
// ─────────────────────────────────────────────────────────

export interface RefreshDocumentAction {
  type: typeof REFRESH_DOCUMENT;
  payload: {
    documentId: string;
    document: PdfDocumentObject;
  };
}

export interface RefreshPagesAction {
  type: typeof REFRESH_PAGES;
  payload: {
    documentId: string;
    pageNumbers: number[];
  };
}

export interface SetPagesAction {
  type: typeof SET_PAGES;
  payload: {
    documentId: string;
    pages: PdfPageObject[][];
  };
}

export interface SetScaleAction {
  type: typeof SET_SCALE;
  payload: {
    documentId?: string; // If not provided, applies to active document
    scale: number;
  };
}

export interface SetRotationAction {
  type: typeof SET_ROTATION;
  payload: {
    documentId?: string; // If not provided, applies to active document
    rotation: Rotation;
  };
}

// ─────────────────────────────────────────────────────────
// Global Default Actions
// ─────────────────────────────────────────────────────────

export interface SetDefaultScaleAction {
  type: typeof SET_DEFAULT_SCALE;
  payload: number;
}

export interface SetDefaultRotationAction {
  type: typeof SET_DEFAULT_ROTATION;
  payload: Rotation;
}

export type DocumentAction =
  | StartLoadingDocumentAction
  | UpdateDocumentLoadingProgressAction
  | SetDocumentLoadedAction
  | SetDocumentErrorAction
  | RetryLoadingDocumentAction
  | CloseDocumentAction
  | SetActiveDocumentAction
  | RefreshDocumentAction
  | RefreshPagesAction
  | SetPagesAction
  | SetScaleAction
  | SetRotationAction
  | SetDefaultScaleAction
  | SetDefaultRotationAction;

// Core actions
export type CoreAction = DocumentAction;

// ─────────────────────────────────────────────────────────
// Action Creators
// ─────────────────────────────────────────────────────────
export const startLoadingDocument = (
  documentId: string,
  name?: string,
  scale?: number,
  rotation?: Rotation,
  passwordProvided?: boolean,
): CoreAction => ({
  type: START_LOADING_DOCUMENT,
  payload: { documentId, name, scale, rotation, passwordProvided },
});

export const updateDocumentLoadingProgress = (
  documentId: string,
  progress: number,
): CoreAction => ({
  type: UPDATE_DOCUMENT_LOADING_PROGRESS,
  payload: { documentId, progress },
});

export const setDocumentLoaded = (documentId: string, document: PdfDocumentObject): CoreAction => ({
  type: SET_DOCUMENT_LOADED,
  payload: { documentId, document },
});

export const setDocumentError = (
  documentId: string,
  error: string,
  errorCode?: PdfErrorCode,
  errorDetails?: any,
): CoreAction => ({
  type: SET_DOCUMENT_ERROR,
  payload: { documentId, error, errorCode, errorDetails },
});

export const retryLoadingDocument = (
  documentId: string,
  passwordProvided?: boolean,
): CoreAction => ({
  type: RETRY_LOADING_DOCUMENT,
  payload: { documentId, passwordProvided },
});

export const closeDocument = (
  documentId: string,
  nextActiveDocumentId?: string | null,
): CoreAction => ({
  type: CLOSE_DOCUMENT,
  payload: { documentId, nextActiveDocumentId },
});

export const setActiveDocument = (documentId: string | null): CoreAction => ({
  type: SET_ACTIVE_DOCUMENT,
  payload: documentId,
});

export const refreshDocument = (documentId: string, document: PdfDocumentObject): CoreAction => ({
  type: REFRESH_DOCUMENT,
  payload: { documentId, document },
});

export const refreshPages = (documentId: string, pageNumbers: number[]): CoreAction => ({
  type: REFRESH_PAGES,
  payload: { documentId, pageNumbers },
});

export const setPages = (documentId: string, pages: PdfPageObject[][]): CoreAction => ({
  type: SET_PAGES,
  payload: { documentId, pages },
});

export const setScale = (scale: number, documentId?: string): CoreAction => ({
  type: SET_SCALE,
  payload: { scale, documentId },
});

export const setRotation = (rotation: Rotation, documentId?: string): CoreAction => ({
  type: SET_ROTATION,
  payload: { rotation, documentId },
});

export const setDefaultScale = (scale: number): CoreAction => ({
  type: SET_DEFAULT_SCALE,
  payload: scale,
});

export const setDefaultRotation = (rotation: Rotation): CoreAction => ({
  type: SET_DEFAULT_ROTATION,
  payload: rotation,
});
