import { BasePluginConfig, EventHook, Listener } from '@embedpdf/core';
import { ImageConversionTypes, Rect } from '@embedpdf/models';

export interface CapturePluginConfig extends BasePluginConfig {
  scale?: number;
  imageType?: ImageConversionTypes;
  withAnnotations?: boolean;
}

export interface CaptureAreaEvent {
  documentId: string;
  pageIndex: number;
  rect: Rect;
  blob: Blob;
  imageType: ImageConversionTypes;
  scale: number;
  withAnnotations: boolean;
}

export interface StateChangeEvent {
  documentId: string;
  state: CaptureDocumentState;
}

export interface MarqueeCaptureCallback {
  onPreview?: (rect: Rect | null) => void;
  onCommit?: (rect: Rect) => void;
}

export interface RegisterMarqueeOnPageOptions {
  documentId: string;
  pageIndex: number;
  scale: number;
  callback: MarqueeCaptureCallback;
}

// Per-document capture state
export interface CaptureDocumentState {
  isMarqueeCaptureActive: boolean;
}

// Scoped capture capability
export interface CaptureScope {
  captureArea(pageIndex: number, rect: Rect): void;
  enableMarqueeCapture(): void;
  disableMarqueeCapture(): void;
  toggleMarqueeCapture(): void;
  isMarqueeCaptureActive(): boolean;
  getState(): CaptureDocumentState;
  onCaptureArea: EventHook<CaptureAreaEvent>;
  onStateChange: EventHook<CaptureDocumentState>;
}

export interface CaptureCapability {
  // Active document operations
  captureArea(pageIndex: number, rect: Rect): void;
  enableMarqueeCapture: () => void;
  disableMarqueeCapture: () => void;
  toggleMarqueeCapture: () => void;
  isMarqueeCaptureActive: () => boolean;
  getState(): CaptureDocumentState;

  // Document-scoped operations
  forDocument(documentId: string): CaptureScope;

  // Global
  registerMarqueeOnPage: (opts: RegisterMarqueeOnPageOptions) => () => void;

  // Events (include documentId)
  onCaptureArea: EventHook<CaptureAreaEvent>;
  onStateChange: EventHook<StateChangeEvent>;
}

// Plugin state
export interface CaptureState {
  // Per-document capture state
  documents: Record<string, CaptureDocumentState>;
  activeDocumentId: string | null;
}
