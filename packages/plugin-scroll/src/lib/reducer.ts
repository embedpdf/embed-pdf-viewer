import { Reducer, CoreState, SET_SCALE, SetScaleAction } from '@embedpdf/core';
import {
  ScrollState,
  ScrollStrategy,
  ScrollPluginConfig,
  ScrollMetrics,
  PageChangeState,
} from './types';
import {
  ScrollAction,
  UPDATE_SCROLL_STATE,
  SET_DESIRED_SCROLL_POSITION,
  UPDATE_TOTAL_PAGES,
  SET_PAGE_CHANGE_STATE,
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

export const defaultPageChangeState: PageChangeState = {
  isChanging: false,
  targetPage: 1,
  fromPage: 1,
  startTime: 0,
};

export const initialState: (coreState: CoreState, config: ScrollPluginConfig) => ScrollState = (
  coreState,
  config,
) => ({
  virtualItems: [],
  totalPages: coreState.pages.length,
  totalContentSize: { width: 0, height: 0 },
  desiredScrollPosition: { x: 0, y: 0 },
  strategy: config.strategy ?? ScrollStrategy.Vertical,
  pageGap: config.pageGap ?? 10,
  scale: coreState.scale,
  pageChangeState: defaultPageChangeState,
  ...defaultScrollMetrics,
});

export const scrollReducer: Reducer<ScrollState, ScrollAction | SetScaleAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case UPDATE_TOTAL_PAGES:
      return { ...state, totalPages: action.payload };
    case SET_SCALE:
      return { ...state, scale: action.payload };
    case UPDATE_SCROLL_STATE:
      return { ...state, ...action.payload };
    case SET_DESIRED_SCROLL_POSITION:
      return { ...state, desiredScrollPosition: action.payload };
    case SET_PAGE_CHANGE_STATE:
      return { ...state, pageChangeState: action.payload };
    default:
      return state;
  }
};
