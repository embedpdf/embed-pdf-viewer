import { Action } from '@embedpdf/core';
import { PageChangeState, ScrollState } from './types';

export const UPDATE_SCROLL_STATE = 'UPDATE_SCROLL_STATE';
export const SET_DESIRED_SCROLL_POSITION = 'SET_DESIRED_SCROLL_POSITION';
export const UPDATE_TOTAL_PAGES = 'UPDATE_TOTAL_PAGES';
export const SET_PAGE_CHANGE_STATE = 'SET_PAGE_CHANGE_STATE';

export interface UpdateScrollStateAction extends Action {
  type: typeof UPDATE_SCROLL_STATE;
  payload: Partial<ScrollState>;
}

export interface SetDesiredScrollPositionAction extends Action {
  type: typeof SET_DESIRED_SCROLL_POSITION;
  payload: { x: number; y: number };
}

export interface UpdateTotalPagesAction extends Action {
  type: typeof UPDATE_TOTAL_PAGES;
  payload: number;
}

export interface SetPageChangeStateAction extends Action {
  type: typeof SET_PAGE_CHANGE_STATE;
  payload: PageChangeState;
}

export type ScrollAction =
  | UpdateScrollStateAction
  | SetDesiredScrollPositionAction
  | UpdateTotalPagesAction
  | SetPageChangeStateAction;

export function updateScrollState(payload: Partial<ScrollState>): UpdateScrollStateAction {
  return { type: UPDATE_SCROLL_STATE, payload };
}

export function setDesiredScrollPosition(payload: {
  x: number;
  y: number;
}): SetDesiredScrollPositionAction {
  return { type: SET_DESIRED_SCROLL_POSITION, payload };
}

export function updateTotalPages(payload: number): UpdateTotalPagesAction {
  return { type: UPDATE_TOTAL_PAGES, payload };
}

export function setPageChangeState(payload: PageChangeState): SetPageChangeStateAction {
  return { type: SET_PAGE_CHANGE_STATE, payload };
}
