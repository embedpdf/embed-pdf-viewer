import { Reducer } from '@embedpdf/core';
import {
  WatermarkAction,
  ADD_WATERMARK,
  REMOVE_WATERMARK,
  ADD_PLACEMENTS,
  CLEAR_PLACEMENTS,
} from './actions';
import { WatermarkState } from './types';

export const initialState: WatermarkState = {
  watermarkIds: [],
  placements: {},
};

export const watermarkReducer: Reducer<WatermarkState, WatermarkAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case ADD_WATERMARK:
      return {
        ...state,
        watermarkIds: [...state.watermarkIds, action.payload.id],
        placements: { ...state.placements, [action.payload.id]: [] },
      };

    case REMOVE_WATERMARK:
      return {
        ...state,
        watermarkIds: state.watermarkIds.filter((id) => id !== action.payload),
        placements: Object.fromEntries(
          Object.entries(state.placements).filter(([key]) => key !== action.payload),
        ),
      };

    case ADD_PLACEMENTS: {
      const existing = state.placements[action.payload.watermarkId] ?? [];
      return {
        ...state,
        placements: {
          ...state.placements,
          [action.payload.watermarkId]: [...existing, ...action.payload.placements],
        },
      };
    }

    case CLEAR_PLACEMENTS: {
      const { watermarkId, documentId } = action.payload;
      if (!documentId) {
        return {
          ...state,
          placements: { ...state.placements, [watermarkId]: [] },
        };
      }
      const filtered = (state.placements[watermarkId] ?? []).filter(
        (p) => p.documentId !== documentId,
      );
      return {
        ...state,
        placements: { ...state.placements, [watermarkId]: filtered },
      };
    }

    default:
      return state;
  }
};

