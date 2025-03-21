import { BasePluginConfig } from "@embedpdf/core";
import { ViewportMetrics } from "@embedpdf/plugin-viewport";

export interface ZoomPluginConfig extends BasePluginConfig {
  defaultZoomLevel: ZoomLevel;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
}

export interface ZoomCapability {
  onZoom(handler: (zoomEvent: ZoomChangeEvent) => void): void;
  updateZoomLevel(zoomLevel: ZoomLevel): ZoomChangeEvent;
  zoomIn(): ZoomChangeEvent;
  zoomOut(): ZoomChangeEvent;
  getState(): ZoomState;
  onStateChange(handler: (state: ZoomState) => void): void;
}

export enum ZoomMode {
  Automatic = 'automatic',
  FitPage = 'fit-page',
  FitWidth = 'fit-width'
}

export type ZoomLevel = ZoomMode | number;

export interface ZoomChangeEvent {
  oldZoom: number;
  oldMetrics: ViewportMetrics;
  newZoom: number;
  newMetrics: ViewportMetrics;
  center?: { x: number; y: number };
} 

export interface ZoomState {
  zoomLevel: ZoomLevel;
  currentZoomLevel: number;
}