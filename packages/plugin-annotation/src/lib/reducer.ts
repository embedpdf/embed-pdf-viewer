import { Reducer } from '@embedpdf/core';
import {
  ADD_COLOR_PRESET,
  COMMIT_PENDING_CHANGES,
  CREATE_ANNOTATION,
  DELETE_ANNOTATION,
  DESELECT_ANNOTATION,
  PATCH_ANNOTATION,
  PURGE_ANNOTATION,
  SELECT_ANNOTATION,
  ADD_TO_SELECTION,
  REMOVE_FROM_SELECTION,
  SET_SELECTION,
  SET_ACTIVE_TOOL_ID,
  SET_ANNOTATIONS,
  AnnotationAction,
  SET_TOOL_DEFAULTS,
  ADD_TOOL,
  INIT_ANNOTATION_STATE,
  CLEANUP_ANNOTATION_STATE,
  SET_ACTIVE_DOCUMENT,
} from './actions';
import {
  AnnotationPluginConfig,
  AnnotationState,
  AnnotationDocumentState,
  TrackedAnnotation,
} from './types';
import { defaultTools } from './tools/default-tools';
import { AnnotationTool } from './tools/types';

const DEFAULT_COLORS = [
  '#E44234',
  '#FF8D00',
  '#FFCD45',
  '#5CC96E',
  '#25D2D1',
  '#597CE2',
  '#C544CE',
  '#7D2E25',
  '#000000',
  '#FFFFFF',
];

/**
 * Compute the deprecated selectedUid from selectedUids.
 * Returns the UID only when exactly one annotation is selected, otherwise null.
 */
const computeSelectedUid = (selectedUids: string[]): string | null =>
  selectedUids.length === 1 ? selectedUids[0] : null;

// Per-document initial state
export const initialDocumentState = (): AnnotationDocumentState => ({
  pages: {},
  byUid: {},
  selectedUids: [],
  selectedUid: null,
  activeToolId: null,
  hasPendingChanges: false,
});

// Helper function to patch an annotation in a document state
const patchAnno = (
  docState: AnnotationDocumentState,
  uid: string,
  patch: Partial<TrackedAnnotation['object']>,
): AnnotationDocumentState => {
  const prev = docState.byUid[uid];
  if (!prev) return docState;
  return {
    ...docState,
    byUid: {
      ...docState.byUid,
      [uid]: {
        ...prev,
        commitState: prev.commitState === 'synced' ? 'dirty' : prev.commitState,
        object: { ...prev.object, ...patch },
      } as TrackedAnnotation,
    },
    hasPendingChanges: true,
  };
};

export const initialState = (cfg: AnnotationPluginConfig): AnnotationState => {
  // Create a Map with a general type signature. This resolves the type conflicts.
  const toolMap = new Map<string, AnnotationTool>();

  // The `satisfies` operator has already validated the specific types in `defaultTools`.
  // Now, we cast each one to the general `AnnotationTool` type for storage in our unified map.
  defaultTools.forEach((t) => toolMap.set(t.id, t as AnnotationTool));

  // User-provided tools can now be safely added, as they also match the `AnnotationTool` type.
  (cfg.tools || []).forEach((t) => toolMap.set(t.id, t));

  return {
    documents: {},
    activeDocumentId: null,
    // `Array.from(toolMap.values())` now correctly returns `AnnotationTool[]`, which matches the state's type.
    tools: Array.from(toolMap.values()),
    colorPresets: cfg.colorPresets ?? DEFAULT_COLORS,
  };
};

export const reducer: Reducer<AnnotationState, AnnotationAction> = (state, action) => {
  switch (action.type) {
    case INIT_ANNOTATION_STATE: {
      const { documentId, state: docState } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: docState,
        },
        // Set as active if no active document
        activeDocumentId: state.activeDocumentId ?? documentId,
      };
    }

    case CLEANUP_ANNOTATION_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remainingDocs } = state.documents;
      return {
        ...state,
        documents: remainingDocs,
        activeDocumentId: state.activeDocumentId === documentId ? null : state.activeDocumentId,
      };
    }

    case SET_ACTIVE_DOCUMENT: {
      return {
        ...state,
        activeDocumentId: action.payload,
      };
    }

    case SET_ANNOTATIONS: {
      const { documentId, annotations } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const newPages: Record<number, string[]> = {};
      const newByUid: Record<string, TrackedAnnotation> = {};

      for (const [pgStr, list] of Object.entries(annotations)) {
        const pageIndex = Number(pgStr);
        const oldUidsOnPage = docState.pages[pageIndex] || [];
        for (const uid of oldUidsOnPage) {
          delete newByUid[uid];
        }
        const newUidsOnPage = list.map((a) => {
          const uid = a.id;
          newByUid[uid] = { commitState: 'synced', object: a };
          return uid;
        });
        newPages[pageIndex] = newUidsOnPage;
      }

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pages: newPages,
            byUid: newByUid,
          },
        },
      };
    }

    case SELECT_ANNOTATION: {
      // Exclusive select: clears previous selection and selects only this one
      const { documentId, id } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...docState, selectedUids: [id], selectedUid: id },
        },
      };
    }

    case DESELECT_ANNOTATION: {
      // Clear all selection
      const { documentId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...docState, selectedUids: [], selectedUid: null },
        },
      };
    }

    case ADD_TO_SELECTION: {
      const { documentId, id } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      // Don't add duplicates
      if (docState.selectedUids.includes(id)) return state;

      const newSelectedUids = [...docState.selectedUids, id];
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selectedUids: newSelectedUids,
            selectedUid: computeSelectedUid(newSelectedUids),
          },
        },
      };
    }

    case REMOVE_FROM_SELECTION: {
      const { documentId, id } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const newSelectedUids = docState.selectedUids.filter((uid) => uid !== id);
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selectedUids: newSelectedUids,
            selectedUid: computeSelectedUid(newSelectedUids),
          },
        },
      };
    }

    case SET_SELECTION: {
      const { documentId, ids } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            selectedUids: ids,
            selectedUid: computeSelectedUid(ids),
          },
        },
      };
    }

    case SET_ACTIVE_TOOL_ID: {
      const { documentId, toolId } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...docState, activeToolId: toolId },
        },
      };
    }

    case CREATE_ANNOTATION: {
      const { documentId, pageIndex, annotation } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const uid = annotation.id;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pages: {
              ...docState.pages,
              [pageIndex]: [...(docState.pages[pageIndex] ?? []), uid],
            },
            byUid: {
              ...docState.byUid,
              [uid]: { commitState: 'new', object: annotation },
            },
            hasPendingChanges: true,
          },
        },
      };
    }

    case DELETE_ANNOTATION: {
      const { documentId, pageIndex, id: uid } = action.payload;
      const docState = state.documents[documentId];
      if (!docState || !docState.byUid[uid]) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pages: {
              ...docState.pages,
              [pageIndex]: (docState.pages[pageIndex] ?? []).filter((u) => u !== uid),
            },
            byUid: {
              ...docState.byUid,
              [uid]: { ...docState.byUid[uid], commitState: 'deleted' },
            },
            hasPendingChanges: true,
          },
        },
      };
    }

    case PATCH_ANNOTATION: {
      const { documentId, id, patch } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: patchAnno(docState, id, patch),
        },
      };
    }

    case COMMIT_PENDING_CHANGES: {
      const { documentId, committedUids } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const committedSet = new Set(committedUids);
      const cleaned: Record<string, TrackedAnnotation> = {};
      let stillHasPending = false;

      for (const [uid, ta] of Object.entries(docState.byUid)) {
        if (committedSet.has(uid)) {
          // This UID was committed - mark as synced
          cleaned[uid] = {
            ...ta,
            commitState:
              ta.commitState === 'dirty' || ta.commitState === 'new' ? 'synced' : ta.commitState,
          };
        } else {
          // This UID was not committed - keep its current state
          cleaned[uid] = ta;
          if (
            ta.commitState === 'new' ||
            ta.commitState === 'dirty' ||
            ta.commitState === 'deleted'
          ) {
            stillHasPending = true;
          }
        }
      }

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: { ...docState, byUid: cleaned, hasPendingChanges: stillHasPending },
        },
      };
    }

    case PURGE_ANNOTATION: {
      const { documentId, pageIndex, uid } = action.payload;
      const docState = state.documents[documentId];
      if (!docState || !docState.byUid[uid]) return state;

      const { [uid]: _gone, ...rest } = docState.byUid;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            pages: {
              ...docState.pages,
              [pageIndex]: (docState.pages[pageIndex] ?? []).filter((u) => u !== uid),
            },
            byUid: rest,
          },
        },
      };
    }

    // Global actions
    case ADD_TOOL: {
      const toolMap = new Map(state.tools.map((t) => [t.id, t]));
      toolMap.set(action.payload.id, action.payload);
      return { ...state, tools: Array.from(toolMap.values()) };
    }

    case SET_TOOL_DEFAULTS: {
      const { toolId, patch } = action.payload;
      return {
        ...state,
        tools: state.tools.map((tool) => {
          if (tool.id === toolId) {
            return { ...tool, defaults: { ...tool.defaults, ...patch } };
          }
          return tool;
        }),
      };
    }

    case ADD_COLOR_PRESET:
      return state.colorPresets.includes(action.payload)
        ? state
        : { ...state, colorPresets: [...state.colorPresets, action.payload] };

    default:
      return state;
  }
};
