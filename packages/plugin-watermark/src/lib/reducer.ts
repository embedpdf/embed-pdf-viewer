import { Reducer } from '@embedpdf/core';
import {
  WatermarkAction,
  ADD_WATERMARK,
  REMOVE_WATERMARK,
  ADD_PLACEMENTS,
  CLEAR_PLACEMENTS,
  CLEAR_DOCUMENT,
} from './actions';
import { WatermarkState } from './types';

export const initialState: WatermarkState = {
  watermarkIdsByDocument: {},
  placementsByDocument: {},
};

export const watermarkReducer: Reducer<WatermarkState, WatermarkAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case ADD_WATERMARK: {
      const { documentId, definition } = action.payload;
      const currentIds = state.watermarkIdsByDocument[documentId] ?? [];
      const currentPlacements = state.placementsByDocument[documentId] ?? {};
      return {
        ...state,
        watermarkIdsByDocument: {
          ...state.watermarkIdsByDocument,
          [documentId]: [...currentIds, definition.id],
        },
        placementsByDocument: {
          ...state.placementsByDocument,
          [documentId]: { ...currentPlacements, [definition.id]: [] },
        },
      };
    }

    case REMOVE_WATERMARK: {
      const { documentId, watermarkId } = action.payload;
      const currentIds = state.watermarkIdsByDocument[documentId] ?? [];
      const currentPlacements = state.placementsByDocument[documentId] ?? {};
      return {
        ...state,
        watermarkIdsByDocument: {
          ...state.watermarkIdsByDocument,
          [documentId]: currentIds.filter((id) => id !== watermarkId),
        },
        placementsByDocument: {
          ...state.placementsByDocument,
          [documentId]: Object.fromEntries(
            Object.entries(currentPlacements).filter(([key]) => key !== watermarkId),
          ),
        },
      };
    }

    case ADD_PLACEMENTS: {
      const { documentId, watermarkId, placements } = action.payload;
      const docPlacements = state.placementsByDocument[documentId] ?? {};
      const existing = docPlacements[watermarkId] ?? [];
      return {
        ...state,
        placementsByDocument: {
          ...state.placementsByDocument,
          [documentId]: {
            ...docPlacements,
            [watermarkId]: [...existing, ...placements],
          },
        },
      };
    }

    case CLEAR_PLACEMENTS: {
      const { watermarkId, documentId } = action.payload;
      const docPlacements = state.placementsByDocument[documentId] ?? {};
      return {
        ...state,
        placementsByDocument: {
          ...state.placementsByDocument,
          [documentId]: { ...docPlacements, [watermarkId]: [] },
        },
      };
    }

    case CLEAR_DOCUMENT: {
      const { documentId } = action.payload;
      const { [documentId]: _removedIds, ...remainingIds } = state.watermarkIdsByDocument;
      const { [documentId]: _removedPlacements, ...remainingPlacements } =
        state.placementsByDocument;
      return {
        ...state,
        watermarkIdsByDocument: remainingIds,
        placementsByDocument: remainingPlacements,
      };
    }

    default:
      return state;
  }
};

