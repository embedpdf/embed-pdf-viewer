import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { PdfAnnotationFlagName, PdfTask } from '@embedpdf/models';

/**
 * The type of watermark content.
 */
export type WatermarkType = 'text' | 'image';

/**
 * Position within a PDF page (in PDF coordinate space, origin bottom-left).
 */
export interface WatermarkPosition {
  x: number;
  y: number;
}

export type WatermarkVerticalAlignment = 'top' | 'center' | 'bottom';

export type WatermarkHorizontalAlignment = 'left' | 'center' | 'right';

/**
 * Optional semantic page alignment for a watermark bounding box.
 */
export interface WatermarkAlignment {
  vertical: WatermarkVerticalAlignment;
  horizontal: WatermarkHorizontalAlignment;
}

/**
 * Size in PDF points.
 */
export interface WatermarkSize {
  width: number;
  height: number;
}

/**
 * Repeat mode for tiling watermarks across a page.
 */
export type WatermarkRepeatMode = 'none' | 'horizontal' | 'vertical' | 'both';

/**
 * Optional spacing (in PDF points) between repeated watermarks.
 */
export interface WatermarkRepeatSpacing {
  x?: number;
  y?: number;
}

/**
 * Text-specific styling options for a watermark.
 */
export interface WatermarkTextOptions {
  /** The text content to display */
  text: string;
  /** Font size in PDF points (default: 48) */
  fontSize?: number;
  /** Font family (default: 'Helvetica') */
  fontFamily?: string;
  /** Text colour as a CSS-style hex string e.g. '#FF0000' (default: '#000000') */
  colour?: string;
}

/**
 * Image-specific options for a watermark.
 */
export interface WatermarkImageOptions {
  /** Raw image data (PNG or JPEG) */
  data: ArrayBuffer;
  /** MIME type of the image data */
  mimeType: 'image/png' | 'image/jpeg';
}

/**
 * Defines which pages a watermark should be applied to.
 * - `'all'`: apply to every page in the document
 * - `number[]`: apply to specific page indices (0-based)
 */
export type WatermarkPageRange = 'all' | number[];

/**
 * A complete watermark definition describing what to render and where.
 */
export interface WatermarkDefinition {
  /** Unique identifier for this watermark */
  id: string;
  /** Whether this is a text or image watermark */
  type: WatermarkType;
  /** Text options (required when type is 'text') */
  textOptions?: WatermarkTextOptions;
  /** Image options (required when type is 'image') */
  imageOptions?: WatermarkImageOptions;
  /** Position of the watermark's bottom-left corner in PDF points */
  position: WatermarkPosition;
  /** Optional semantic page alignment for placement */
  alignment?: WatermarkAlignment;
  /** Size of the watermark bounding box in PDF points */
  size: WatermarkSize;
  /** Opacity from 0.0 (fully transparent) to 1.0 (fully opaque). Default: 0.5 */
  opacity?: number;
  /** Rotation angle in degrees (clockwise). Default: 0 */
  rotation?: number;
  /** Repeat mode. Default: 'none' */
  repeat?: WatermarkRepeatMode;
  /** Spacing between repeated instances. Default: { x: 0, y: 0 } */
  repeatSpacing?: WatermarkRepeatSpacing;
  /** Which pages to apply the watermark to. Default: 'all' */
  pageRange?: WatermarkPageRange;
  /** Whether the watermark annotation is read-only. Default: true */
  readOnly?: boolean;
  /** Whether the watermark should appear when printing. Default: true */
  printable?: boolean;
}

/**
 * Input for creating a new watermark (id is auto-generated).
 */
export type WatermarkInput = Omit<WatermarkDefinition, 'id'>;

/**
 * Configuration for the watermark plugin.
 */
export interface WatermarkPluginConfig extends BasePluginConfig {
  /** Watermarks seeded per document and optionally auto-applied when loaded */
  watermarks?: WatermarkInput[];
  /** Whether to auto-apply configured watermarks on document load. Default: true */
  autoApply?: boolean;
}

/**
 * Internal state tracked by the watermark plugin's reducer.
 */
export interface WatermarkState {
  /** Maps document ID -> watermark definition IDs registered for that document */
  watermarkIdsByDocument: Record<string, string[]>;
  /** Maps document ID -> watermark definition ID -> placed instances */
  placementsByDocument: Record<string, Record<string, WatermarkPlacement[]>>;
}

/**
 * Tracks a single placed watermark instance (flattened into page content).
 */
export interface WatermarkPlacement {
  /** The document ID where this was placed */
  documentId: string;
  /** The page index where this was flattened */
  pageIndex: number;
  /** The original annotation ID (no longer exists after flatten) */
  annotationId: string;
}

/**
 * Event emitted when watermarks change.
 */
export interface WatermarkChangeEvent {
  watermarks: WatermarkDefinition[];
}

/**
 * The public capability interface exposed by the watermark plugin.
 */
export interface WatermarkCapability {
  /**
   * Add a watermark definition and immediately apply it to the active document.
   * Watermarks are scoped per document and do not affect other open documents.
   * @returns The generated watermark ID.
   */
  addWatermark(input: WatermarkInput): PdfTask<string>;

  /**
   * Remove a watermark definition from the active document.
   * Note: already-flattened watermarks are permanent in the PDF and
   * cannot be visually removed.
   */
  removeWatermark(id: string): PdfTask<void>;

  /**
   * Get watermark definitions for the active document.
   */
  getWatermarks(): WatermarkDefinition[];

  /**
   * Apply all watermarks registered for a specific document.
   * Each watermark is flattened into the page content stream.
   */
  applyToDocument(documentId: string): PdfTask<void>;

  /**
   * Clear placement tracking records for a document.
   * Does NOT remove the flattened watermark content from pages.
   */
  clearFromDocument(documentId: string): PdfTask<void>;

  /** Subscribe to watermark definition changes */
  onWatermarkChange: EventHook<WatermarkChangeEvent>;
}

/**
 * Compute the annotation flags for a watermark.
 */
export function computeWatermarkFlags(def: WatermarkDefinition): PdfAnnotationFlagName[] {
  const flags: PdfAnnotationFlagName[] = [];

  if (def.printable !== false) {
    flags.push('print');
  }

  if (def.readOnly !== false) {
    flags.push('readOnly');
    flags.push('locked');
  }

  return flags;
}





