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
  SET_ACTIVE_TOOL_ID,
  SET_ANNOTATIONS,
  AnnotationAction,
  SET_TOOL_DEFAULTS,
  ADD_TOOL,
} from './actions';
import { AnnotationPluginConfig, AnnotationState, TrackedAnnotation } from './types';
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

const patchAnno = (
  state: AnnotationState,
  uid: string,
  patch: Partial<TrackedAnnotation['object']>,
): AnnotationState => {
  const prev = state.byUid[uid];
  if (!prev) return state;
  return {
    ...state,
    byUid: {
      ...state.byUid,
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
    pages: {},
    byUid: {},
    selectedUid: null,
    activeToolId: null,
    // `Array.from(toolMap.values())` now correctly returns `AnnotationTool[]`, which matches the state's type.
    tools: Array.from(toolMap.values()),
    colorPresets: cfg.colorPresets ?? DEFAULT_COLORS,
    hasPendingChanges: false,
  };
};

export const reducer: Reducer<AnnotationState, AnnotationAction> = (state, action) => {
  switch (action.type) {
    case SET_ANNOTATIONS: {
      const newPages = { ...state.pages };
      const newByUid = { ...state.byUid };
      for (const [pgStr, list] of Object.entries(action.payload)) {
        const pageIndex = Number(pgStr);
        const oldUidsOnPage = state.pages[pageIndex] || [];
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
      return { ...state, pages: newPages, byUid: newByUid };
    }

    case SET_ACTIVE_TOOL_ID:
      return { ...state, activeToolId: action.payload };

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

    case SELECT_ANNOTATION:
      return { ...state, selectedUid: action.payload.id };

    case DESELECT_ANNOTATION:
      return { ...state, selectedUid: null };

    case ADD_COLOR_PRESET:
      return state.colorPresets.includes(action.payload)
        ? state
        : { ...state, colorPresets: [...state.colorPresets, action.payload] };

    case CREATE_ANNOTATION: {
      const { pageIndex, annotation } = action.payload;
      const uid = annotation.id;
      return {
        ...state,
        pages: { ...state.pages, [pageIndex]: [...(state.pages[pageIndex] ?? []), uid] },
        byUid: { ...state.byUid, [uid]: { commitState: 'new', object: annotation } },
        hasPendingChanges: true,
      };
    }

    case DELETE_ANNOTATION: {
      const { pageIndex, id: uid } = action.payload;
      if (!state.byUid[uid]) return state;

      /* keep the object but mark it as deleted */
      return {
        ...state,
        pages: {
          ...state.pages,
          [pageIndex]: (state.pages[pageIndex] ?? []).filter((u) => u !== uid),
        },
        byUid: {
          ...state.byUid,
          [uid]: { ...state.byUid[uid], commitState: 'deleted' },
        },
        hasPendingChanges: true,
      };
    }

    case PATCH_ANNOTATION:
      return patchAnno(state, action.payload.id, action.payload.patch);

    case COMMIT_PENDING_CHANGES: {
      const cleaned: AnnotationState['byUid'] = {};
      for (const [uid, ta] of Object.entries(state.byUid)) {
        cleaned[uid] = {
          ...ta,
          commitState:
            ta.commitState === 'dirty' || ta.commitState === 'new' ? 'synced' : ta.commitState,
        };
      }
      return { ...state, byUid: cleaned, hasPendingChanges: false };
    }

    case PURGE_ANNOTATION: {
      const { uid } = action.payload;
      const { [uid]: _gone, ...rest } = state.byUid;
      return { ...state, byUid: rest };
    }

    default:
      return state;
  }
};
