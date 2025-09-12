import { PointerEventHandlersWithLifecycle } from '@embedpdf/plugin-interaction-manager';
import {
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  Rect,
  Size,
  AnnotationCreateContext,
  PdfAnnotationBorderStyle,
  Position,
  LineEndings,
  PdfInkListObject,
  PdfFreeTextAnnoObject,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
} from '@embedpdf/models';
import { AnnotationTool } from '../tools/types';

export interface CirclePreviewData {
  rect: Rect;
  color: string;
  opacity: number;
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: PdfAnnotationBorderStyle;
  strokeDashArray: number[];
}

interface SquarePreviewData extends CirclePreviewData {}

export interface PolygonPreviewData {
  rect: Rect;
  vertices: Position[]; // All committed vertices
  currentVertex: Position; // The current mouse position for the rubber-band line
  color?: string;
  opacity?: number;
  strokeWidth: number;
  strokeColor?: string;
  strokeStyle?: PdfAnnotationBorderStyle;
  strokeDashArray?: number[];
}

export interface PolylinePreviewData {
  rect: Rect;
  vertices: Position[]; // All committed vertices for the line
  currentVertex: Position; // The current mouse position for the rubber-band segment
  color: string;
  strokeColor: string;
  opacity: number;
  strokeWidth: number;
  lineEndings?: LineEndings;
}

export interface LinePreviewData {
  rect: Rect;
  linePoints: { start: Position; end: Position };
  strokeWidth: number;
  color: string;
  strokeColor: string;
  opacity: number;
  lineEndings?: LineEndings;
  strokeStyle: PdfAnnotationBorderStyle;
  strokeDashArray: number[];
}

export interface InkPreviewData {
  rect: Rect;
  inkList: PdfInkListObject[];
  strokeWidth: number;
  color: string;
  opacity: number;
}

export interface FreeTextPreviewData {
  rect: Rect;
  fontColor?: string;
  opacity?: number;
  fontSize?: number;
  fontFamily?: PdfStandardFont;
  backgroundColor?: string;
  textAlign?: PdfTextAlignment;
  verticalAlign?: PdfVerticalAlignment;
  contents?: string;
}

/**
 * Map types to their preview data
 */
export interface PreviewDataMap {
  [PdfAnnotationSubtype.CIRCLE]: CirclePreviewData;
  [PdfAnnotationSubtype.SQUARE]: SquarePreviewData;
  [PdfAnnotationSubtype.POLYGON]: PolygonPreviewData;
  [PdfAnnotationSubtype.POLYLINE]: PolylinePreviewData;
  [PdfAnnotationSubtype.LINE]: LinePreviewData;
  [PdfAnnotationSubtype.INK]: InkPreviewData;
  [PdfAnnotationSubtype.FREETEXT]: FreeTextPreviewData;
  // Add other types as you implement them
}

/**
 * Typed preview state - constrain T to keys that exist in PreviewDataMap
 */
export type TypedPreviewState<T extends keyof PreviewDataMap> = {
  type: T;
  bounds: Rect;
  data: PreviewDataMap[T];
};

/**
 * Union of all preview states
 */
export type AnyPreviewState = {
  [K in keyof PreviewDataMap]: TypedPreviewState<K>;
}[keyof PreviewDataMap];

/**
 * Generic version for handlers - use conditional type for safety
 */
export interface PreviewState<T extends PdfAnnotationSubtype = PdfAnnotationSubtype> {
  type: T;
  bounds: Rect;
  data: T extends keyof PreviewDataMap ? PreviewDataMap[T] : any;
}

/**
 * Defines the DOM-based services that the UI layer must provide to the handlers.
 * This is the bridge that keeps the core logic framework-agnostic.
 */
export interface HandlerServices {
  requestFile(options: { accept: string; onFile: (file: File) => void }): void;

  processImage(options: {
    source: string | File;
    maxWidth?: number;
    maxHeight?: number;
    onComplete: (result: { imageData: ImageData; width: number; height: number }) => void;
  }): void;
}

/**
 * The context object passed to a handler factory when creating a handler.
 * It contains all the necessary information and callbacks.
 */
export interface HandlerFactory<A extends PdfAnnotationObject> {
  annotationType: PdfAnnotationSubtype;
  create(context: HandlerContext<A>): PointerEventHandlersWithLifecycle;
}

export interface HandlerContext<A extends PdfAnnotationObject> {
  getTool: () => AnnotationTool<A> | undefined;
  pageIndex: number;
  pageSize: Size;
  scale: number;
  services: HandlerServices;
  onPreview: (state: AnyPreviewState | null) => void;
  onCommit: (annotation: A, context?: AnnotationCreateContext<A>) => void;
}
