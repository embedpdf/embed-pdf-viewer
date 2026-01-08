import { EditDocumentState, EditPageState, EditState } from './types';
import {
  EditAction,
  INIT_EDIT_STATE,
  CLEANUP_EDIT_STATE,
  INIT_PAGE_STATE,
  SET_DETECTION_STATUS,
  SET_TEXT_BLOCKS,
  SET_LAYOUT_DATA,
  SELECT_BLOCK,
  DESELECT_BLOCK,
  SET_BLOCK_OFFSET,
  CLEAR_BLOCK_OFFSET,
  CLEAR_ALL_OFFSETS,
} from './actions';

// ─────────────────────────────────────────────────────────
// Initial States
// ─────────────────────────────────────────────────────────

export const initialPageState: EditPageState = {
  detectionStatus: 'idle',
  textBlocks: [],
  selectedBlockIndex: null,
  blockOffsets: {},
  layoutSummary: null,
  words: [],
  lines: [],
  columns: [],
  tables: [],
};

export const initialDocumentState: EditDocumentState = {
  pages: {},
};

export const initialState: EditState = {
  documents: {},
};

// ─────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────

const updateDocState = (
  state: EditState,
  documentId: string,
  newDocState: EditDocumentState,
): EditState => ({
  ...state,
  documents: {
    ...state.documents,
    [documentId]: newDocState,
  },
});

const updatePageState = (
  docState: EditDocumentState,
  pageIndex: number,
  newPageState: EditPageState,
): EditDocumentState => ({
  ...docState,
  pages: {
    ...docState.pages,
    [pageIndex]: newPageState,
  },
});

// ─────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────

export const editReducer = (state = initialState, action: EditAction): EditState => {
  switch (action.type) {
    case INIT_EDIT_STATE: {
      const { documentId, state: docState } = action.payload;
      return updateDocState(state, documentId, docState);
    }

    case CLEANUP_EDIT_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case INIT_PAGE_STATE: {
      const { documentId, pageIndex, state: pageState } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      return updateDocState(state, documentId, updatePageState(docState, pageIndex, pageState));
    }

    case SET_DETECTION_STATUS: {
      const { documentId, pageIndex, status } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      const pageState = docState.pages[pageIndex];
      if (!pageState) return state;
      return updateDocState(
        state,
        documentId,
        updatePageState(docState, pageIndex, {
          ...pageState,
          detectionStatus: status,
        }),
      );
    }

    case SET_TEXT_BLOCKS: {
      const { documentId, pageIndex, blocks } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      const pageState = docState.pages[pageIndex];
      if (!pageState) return state;
      return updateDocState(
        state,
        documentId,
        updatePageState(docState, pageIndex, {
          ...pageState,
          textBlocks: blocks,
          detectionStatus: 'detected',
        }),
      );
    }

    case SET_LAYOUT_DATA: {
      const { documentId, pageIndex, layoutSummary, words, lines, columns, tables } =
        action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      const pageState = docState.pages[pageIndex];
      if (!pageState) return state;
      return updateDocState(
        state,
        documentId,
        updatePageState(docState, pageIndex, {
          ...pageState,
          layoutSummary,
          words,
          lines,
          columns,
          tables,
        }),
      );
    }

    case SELECT_BLOCK: {
      const { documentId, pageIndex, blockIndex } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      // First, deselect any previously selected block on any page
      const updatedPages: Record<number, EditPageState> = {};
      for (const [idx, page] of Object.entries(docState.pages)) {
        const pageIdx = parseInt(idx, 10);
        if (page.selectedBlockIndex !== null) {
          updatedPages[pageIdx] = { ...page, selectedBlockIndex: null };
        }
      }

      // Then select the new block
      const targetPage = docState.pages[pageIndex] || initialPageState;
      updatedPages[pageIndex] = { ...targetPage, selectedBlockIndex: blockIndex };

      return updateDocState(state, documentId, {
        ...docState,
        pages: { ...docState.pages, ...updatedPages },
      });
    }

    case DESELECT_BLOCK: {
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      // Deselect on all pages
      const updatedPages: Record<number, EditPageState> = {};
      for (const [idx, page] of Object.entries(docState.pages)) {
        const pageIdx = parseInt(idx, 10);
        if (page.selectedBlockIndex !== null) {
          updatedPages[pageIdx] = { ...page, selectedBlockIndex: null };
        }
      }

      if (Object.keys(updatedPages).length === 0) return state;

      return updateDocState(state, documentId, {
        ...docState,
        pages: { ...docState.pages, ...updatedPages },
      });
    }

    case SET_BLOCK_OFFSET: {
      const { documentId, pageIndex, blockIndex, offset } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      const pageState = docState.pages[pageIndex];
      if (!pageState) return state;
      return updateDocState(
        state,
        documentId,
        updatePageState(docState, pageIndex, {
          ...pageState,
          blockOffsets: {
            ...pageState.blockOffsets,
            [blockIndex]: offset,
          },
        }),
      );
    }

    case CLEAR_BLOCK_OFFSET: {
      const { documentId, pageIndex, blockIndex } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      const pageState = docState.pages[pageIndex];
      if (!pageState) return state;
      const { [blockIndex]: removed, ...remainingOffsets } = pageState.blockOffsets;
      return updateDocState(
        state,
        documentId,
        updatePageState(docState, pageIndex, {
          ...pageState,
          blockOffsets: remainingOffsets,
        }),
      );
    }

    case CLEAR_ALL_OFFSETS: {
      const { documentId, pageIndex } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;
      const pageState = docState.pages[pageIndex];
      if (!pageState) return state;
      return updateDocState(
        state,
        documentId,
        updatePageState(docState, pageIndex, {
          ...pageState,
          blockOffsets: {},
        }),
      );
    }

    default:
      return state;
  }
};
