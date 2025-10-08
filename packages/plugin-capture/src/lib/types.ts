import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { ImageConversionTypes, Rect } from '@embedpdf/models';

export interface CapturePluginConfig extends BasePluginConfig {
  scale?: number;
  imageType?: ImageConversionTypes;
  withAnnotations?: boolean;
}

export interface CaptureAreaEvent {
  pageIndex: number;
  rect: Rect;
  blob: Blob;
  imageType: ImageConversionTypes;
  scale: number;
  withAnnotations: boolean;
}

export interface MarqueeCaptureCallback {
  onPreview?: (rect: Rect | null) => void;
  onCommit?: (rect: Rect) => void;
}

export interface RegisterMarqueeOnPageOptions {
  pageIndex: number;
  scale: number;
  callback: MarqueeCaptureCallback;
}

export interface CaptureCapability {
  onCaptureArea: EventHook<CaptureAreaEvent>;
  onMarqueeCaptureActiveChange: EventHook<boolean>;
  captureArea(pageIndex: number, rect: Rect): void;
  enableMarqueeCapture: () => void;
  disableMarqueeCapture: () => void;
  toggleMarqueeCapture: () => void;
  isMarqueeCaptureActive: () => boolean;
  registerMarqueeOnPage: (opts: RegisterMarqueeOnPageOptions) => () => void;
}
