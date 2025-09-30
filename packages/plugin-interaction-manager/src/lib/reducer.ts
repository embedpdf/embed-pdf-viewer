import { Reducer } from '@embedpdf/core';
import {
  ACTIVATE_MODE,
  SET_DEFAULT_MODE,
  InteractionManagerAction,
  PAUSE_INTERACTION,
  RESUME_INTERACTION,
  SET_CURSOR,
  SET_EXCLUSION_RULES,
  ADD_EXCLUSION_CLASS,
  REMOVE_EXCLUSION_CLASS,
  ADD_EXCLUSION_ATTRIBUTE,
  REMOVE_EXCLUSION_ATTRIBUTE,
} from './actions';
import { InteractionManagerState } from './types';

export const initialState: InteractionManagerState = {
  activeMode: 'pointerMode',
  defaultMode: 'pointerMode',
  cursor: 'auto',
  paused: false,
  exclusionRules: {
    classes: [],
    dataAttributes: [],
  },
};

export const reducer: Reducer<InteractionManagerState, InteractionManagerAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case ACTIVATE_MODE:
      return {
        ...state,
        activeMode: action.payload.mode,
      };
    case SET_CURSOR:
      return {
        ...state,
        cursor: action.payload.cursor,
      };
    case PAUSE_INTERACTION:
      return {
        ...state,
        paused: true,
      };
    case RESUME_INTERACTION:
      return {
        ...state,
        paused: false,
      };
    case SET_DEFAULT_MODE:
      return {
        ...state,
        defaultMode: action.payload.mode,
      };
    case SET_EXCLUSION_RULES:
      return {
        ...state,
        exclusionRules: action.payload.rules,
      };

    case ADD_EXCLUSION_CLASS:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          classes: [...(state.exclusionRules.classes || []), action.payload.className].filter(
            (v, i, a) => a.indexOf(v) === i,
          ), // Remove duplicates
        },
      };

    case REMOVE_EXCLUSION_CLASS:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          classes: (state.exclusionRules.classes || []).filter(
            (c) => c !== action.payload.className,
          ),
        },
      };

    case ADD_EXCLUSION_ATTRIBUTE:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          dataAttributes: [
            ...(state.exclusionRules.dataAttributes || []),
            action.payload.attribute,
          ].filter((v, i, a) => a.indexOf(v) === i),
        },
      };

    case REMOVE_EXCLUSION_ATTRIBUTE:
      return {
        ...state,
        exclusionRules: {
          ...state.exclusionRules,
          dataAttributes: (state.exclusionRules.dataAttributes || []).filter(
            (a) => a !== action.payload.attribute,
          ),
        },
      };
    default:
      return state;
  }
};
