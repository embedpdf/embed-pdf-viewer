import { PointerEventHandlersWithLifecycle } from '@embedpdf/plugin-interaction-manager';
import {
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  Rect,
  Rotation,
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
  PdfBlendMode,
  PdfAnnotationLineEnding,
} from '@embedpdf/models';
import { FormattedSelection } from '@embedpdf/plugin-selection';
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

export interface SquarePreviewData extends CirclePreviewData {}

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
  strokeColor: string;
  opacity: number;
  blendMode?: PdfBlendMode;
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
  calloutLine?: Position[];
  textBox?: Rect;
  strokeColor?: string;
  strokeWidth?: number;
  lineEnding?: PdfAnnotationLineEnding;
  color?: string;
}

export interface LinkPreviewData {
  rect: Rect;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: PdfAnnotationBorderStyle;
  strokeDashArray: number[];
}

export interface StampPreviewData {
  rect: Rect;
  ghostUrl: string;
  pageRotation: Rotation;
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
  [PdfAnnotationSubtype.LINK]: LinkPreviewData;
  [PdfAnnotationSubtype.STAMP]: StampPreviewData;
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
}

/**
 * Extensible map from tool ID to per-activation context data.
 * Plugins extend this via declaration merging to provide typed context
 * for their custom tools (e.g. stamp appearance data, ghost image URL).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ToolContextMap {}

/**
 * Resolves the tool context type for a given tool ID.
 * Returns the mapped type if known, otherwise a generic record.
 */
export type ResolvedToolContext<TId extends string> = TId extends keyof ToolContextMap
  ? ToolContextMap[TId]
  : Record<string, unknown>;

/**
 * The context object passed to a handler factory when creating a handler.
 * It contains all the necessary information and callbacks.
 */
export interface HandlerFactory<A extends PdfAnnotationObject, TId extends string = string> {
  annotationType: PdfAnnotationSubtype;
  create(context: HandlerContext<A, TId>): PointerEventHandlersWithLifecycle;
}

export interface HandlerContext<A extends PdfAnnotationObject, TId extends string = string> {
  getTool: () => AnnotationTool<A> | undefined;
  getToolContext: () => ResolvedToolContext<TId> | undefined;
  pageIndex: number;
  pageSize: Size;
  /** Effective page rotation (page intrinsic + document rotation), as a quarter-turn value (0-3). */
  pageRotation: Rotation;
  scale: number;
  services: HandlerServices;
  onPreview: (state: PreviewState<A['type']> | null) => void;
  onCommit: (annotation: A, context?: AnnotationCreateContext<A>) => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Selection-based handler types
 *
 * Mirrors the HandlerFactory pattern but for text-selection-based tools
 * (highlight, underline, strikeout, squiggly, insertText, replaceText).
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface SelectionHandlerContext<A extends PdfAnnotationObject = PdfAnnotationObject> {
  toolId: string;
  documentId: string;
  getTool: () => AnnotationTool<A> | null;
  createAnnotation: (pageIndex: number, annotation: PdfAnnotationObject) => void;
  selectAnnotation: (pageIndex: number, id: string) => void;
}

export interface SelectionHandlerFactory<A extends PdfAnnotationObject = PdfAnnotationObject> {
  toolId: string;
  handle(
    context: SelectionHandlerContext<A>,
    selections: FormattedSelection[],
    getText: () => Promise<string | undefined>,
  ): void;
}
