import { Reducer, CoreState, SET_SCALE, SetScaleAction } from '@embedpdf/core';
import {
  ScrollState,
  ScrollStrategy,
  ScrollPluginConfig,
  ScrollMetrics,
  ScrollMode,
} from './types';
import {
  ScrollAction,
  UPDATE_SCROLL_STATE,
  SET_DESIRED_SCROLL_POSITION,
  SET_SCROLL_MODE,
} from './actions';

export const defaultScrollMetrics: ScrollMetrics = {
  currentPage: 1,
  visiblePages: [],
  pageVisibilityMetrics: [],
  renderedPageIndexes: [],
  scrollOffset: { x: 0, y: 0 },
  startSpacing: 0,
  endSpacing: 0,
};

export const initialState: (coreState: CoreState, config: ScrollPluginConfig) => ScrollState = (
  coreState,
  config,
) => ({
  virtualItems: [],
  totalContentSize: { width: 0, height: 0 },
  desiredScrollPosition: { x: 0, y: 0 },
  strategy: config.strategy ?? ScrollStrategy.Vertical,
  mode: config.mode ?? ScrollMode.Continuous,
  pageGap: config.pageGap ?? 10,
  scale: coreState.scale,
  ...defaultScrollMetrics,
});

export const scrollReducer: Reducer<ScrollState, ScrollAction | SetScaleAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case SET_SCALE:
      return { ...state, scale: action.payload };
    case UPDATE_SCROLL_STATE:
      return { ...state, ...action.payload };
    case SET_SCROLL_MODE:
      return { ...state, mode: action.payload };
    case SET_DESIRED_SCROLL_POSITION:
      return { ...state, desiredScrollPosition: action.payload };
    default:
      return state;
  }
};
