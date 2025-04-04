import { Reducer } from "@embedpdf/core";
import { ZoomState, ZoomMode } from "./types";
import { SET_ZOOM_LEVEL, ZoomAction } from "./actions";

export const initialState: ZoomState = {
  zoomLevel: ZoomMode.Automatic,
  currentZoomLevel: 1,
};

export const zoomReducer: Reducer<ZoomState, ZoomAction> = (state = initialState, action) => {
  switch (action.type) {
    case SET_ZOOM_LEVEL:
      return {
        ...state,
        zoomLevel: action.payload.zoomLevel,
        currentZoomLevel: action.payload.currentZoomLevel,
      };
    default:
      return state;
  }
};