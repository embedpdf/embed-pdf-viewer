import { Reducer } from '@embedpdf/core';
import { AiManagerState } from './types';
import {
  AiManagerAction,
  SET_BACKEND,
  SET_MODEL_LOADED,
  SET_MODEL_UNLOADED,
  SET_MODEL_LOADING,
  SET_MODEL_LOADING_DONE,
} from './actions';

export const initialState: AiManagerState = {
  backend: null,
  loadedModels: [],
  loadingModels: [],
};

export const reducer: Reducer<AiManagerState, AiManagerAction> = (state = initialState, action) => {
  switch (action.type) {
    case SET_BACKEND:
      return { ...state, backend: action.payload };

    case SET_MODEL_LOADING:
      return {
        ...state,
        loadingModels: state.loadingModels.includes(action.payload)
          ? state.loadingModels
          : [...state.loadingModels, action.payload],
      };

    case SET_MODEL_LOADING_DONE:
      return {
        ...state,
        loadingModels: state.loadingModels.filter((id) => id !== action.payload),
      };

    case SET_MODEL_LOADED:
      return {
        ...state,
        loadedModels: state.loadedModels.includes(action.payload)
          ? state.loadedModels
          : [...state.loadedModels, action.payload],
        loadingModels: state.loadingModels.filter((id) => id !== action.payload),
      };

    case SET_MODEL_UNLOADED:
      return {
        ...state,
        loadedModels: state.loadedModels.filter((id) => id !== action.payload),
      };

    default:
      return state;
  }
};
