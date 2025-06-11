import { Action } from '@embedpdf/core';
import { ScrollMode, ScrollState } from './types';

export const UPDATE_SCROLL_STATE = 'UPDATE_SCROLL_STATE';
export const SET_DESIRED_SCROLL_POSITION = 'SET_DESIRED_SCROLL_POSITION';
export const SET_SCROLL_MODE = 'SET_SCROLL_MODE';

export interface UpdateScrollStateAction extends Action {
  type: typeof UPDATE_SCROLL_STATE;
  payload: Partial<ScrollState>;
}

export interface SetDesiredScrollPositionAction extends Action {
  type: typeof SET_DESIRED_SCROLL_POSITION;
  payload: { x: number; y: number };
}

export interface SetScrollModeAction extends Action {
  type: typeof SET_SCROLL_MODE;
  payload: ScrollMode;
}

export type ScrollAction =
  | UpdateScrollStateAction
  | SetDesiredScrollPositionAction
  | SetScrollModeAction;

export function updateScrollState(payload: Partial<ScrollState>): UpdateScrollStateAction {
  return { type: UPDATE_SCROLL_STATE, payload };
}

export function setDesiredScrollPosition(payload: {
  x: number;
  y: number;
}): SetDesiredScrollPositionAction {
  return { type: SET_DESIRED_SCROLL_POSITION, payload };
}

export function setScrollMode(mode: ScrollMode): SetScrollModeAction {
  return { type: SET_SCROLL_MODE, payload: mode };
}
