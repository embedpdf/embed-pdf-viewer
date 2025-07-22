import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  PdfAnnotationObject,
  PdfErrorReason,
  Task,
  PdfAnnotationSubtype,
  WebAlphaColor,
  PdfTask,
  Rotation,
  ImageConversionTypes,
  AppearanceMode,
  PdfPageObject,
  PdfDocumentObject,
  PdfBlendMode,
} from '@embedpdf/models';

/* Metadata tracked per anno */
export type CommitState =
  | 'new' // created locally, not yet written to the PDF
  | 'dirty' // exists remotely, but local fields diverge
  | 'deleted' // deleted locally, not yet written to the PDF
  | 'synced' // identical to the PDF
  | 'ignored'; // managed by a different plugin – never auto-committed

export interface TrackedAnnotation {
  /** A stable, client-side unique identifier for history and state management. */
  localId: number;
  /**
   * If the engine has already created the annotation in the PDF
   * this is the definitive id coming from the engine.
   * It is **never** cleared once set.
   */
  pdfId?: number;
  /** local commit bookkeeping */
  commitState: CommitState;
  /** the actual annotation object */
  object: PdfAnnotationObject;
}

export interface RenderAnnotationOptions {
  pageIndex: number;
  annotation: PdfAnnotationObject;
  scaleFactor?: number;
  rotation?: Rotation;
  dpr?: number; // device-pixel-ratio (canvas)
  mode?: AppearanceMode;
  imageType?: ImageConversionTypes;
}

export interface BaseAnnotationDefaults extends WebAlphaColor {
  name: string;
  subtype: PdfAnnotationSubtype;
  interaction: {
    mode: string;
    exclusive: boolean;
    cursor?: string;
  };
  textSelection?: boolean;
  blendMode?: PdfBlendMode;
}

export type TextMarkupSubtype =
  | PdfAnnotationSubtype.HIGHLIGHT
  | PdfAnnotationSubtype.UNDERLINE
  | PdfAnnotationSubtype.STRIKEOUT
  | PdfAnnotationSubtype.SQUIGGLY;

export interface TextMarkupDefaults extends BaseAnnotationDefaults {
  subtype: TextMarkupSubtype;
  blendMode: PdfBlendMode;
}

export interface InkDefaults extends BaseAnnotationDefaults {
  subtype: PdfAnnotationSubtype.INK;
  strokeWidth: number;
  intent?: string;
}

export interface TextDefaults extends BaseAnnotationDefaults {
  subtype: PdfAnnotationSubtype.FREETEXT;
  fontSize: number;
}

export type AnnotationDefaults = TextMarkupDefaults | InkDefaults | TextDefaults;

export type ToolDefaultsByMode = {
  [K in string]: AnnotationDefaults;
};

export type ActiveTool =
  | { variantKey: null; defaults: null }
  | { [K in string]: { variantKey: K; defaults: ToolDefaultsByMode[K] } }[string];

export interface AnnotationState {
  pages: Record<number, string[]>; // pageIndex → list of UIDs
  byUid: Record<string, TrackedAnnotation>; // UID → latest object

  selectedUid: string | null;
  activeVariant: string | null;

  toolDefaults: Record<string, AnnotationDefaults>;
  colorPresets: string[];

  hasPendingChanges: boolean;
}

export interface AnnotationPluginConfig extends BasePluginConfig {
  toolDefaults?: Record<string, AnnotationDefaults>;
  colorPresets?: string[];
  /**
   * When `false` mutations are kept in memory and must be
   * flushed with `commitPendingChanges()`.
   */
  autoCommit?: boolean;
}

export interface AnnotationCapability {
  getPageAnnotations: (
    options: GetPageAnnotationsOptions,
  ) => Task<PdfAnnotationObject[], PdfErrorReason>;
  getSelectedAnnotation: () => TrackedAnnotation | null;
  selectAnnotation: (pageIndex: number, annotationId: number) => void;
  deselectAnnotation: () => void;
  getActiveVariant: () => string | null;
  setActiveVariant: (variantKey: string | null) => void;
  /** strongly typed – only sub-types we have defaults for */
  getToolDefaults: (variantKey: string) => AnnotationDefaults;
  getToolDefaultsBySubtypeAndIntent: (
    subtype: PdfAnnotationSubtype,
    intent?: string,
  ) => AnnotationDefaults;
  getToolDefaultsBySubtype: (subtype: PdfAnnotationSubtype) => AnnotationDefaults;
  /** Partially patch a single tool’s defaults */
  setToolDefaults: (variantKey: string, patch: Partial<AnnotationDefaults>) => void;
  /** current palette – UI just reads this */
  getColorPresets: () => string[];
  /** append a swatch (deduped by RGBA) */
  addColorPreset: (color: string) => void;
  createAnnotation: (pageIndex: number, annotation: PdfAnnotationObject) => void;
  updateAnnotation: (
    pageIndex: number,
    annotationId: number,
    patch: Partial<PdfAnnotationObject>,
  ) => void;
  deleteAnnotation: (pageIndex: number, annotationId: number) => void;
  renderAnnotation: (options: RenderAnnotationOptions) => Task<Blob, PdfErrorReason>;
  /** undo / redo */
  onStateChange: EventHook<AnnotationState>;
  onActiveVariantChange: EventHook<string | null>;
  onActiveToolChange: EventHook<ActiveTool>;
  commit: () => void;
}

export interface SelectedAnnotation {
  pageIndex: number;
  localId: number;
  annotation: PdfAnnotationObject;
}

export interface GetPageAnnotationsOptions {
  pageIndex: number;
}

export interface UpdateAnnotationColorOptions extends WebAlphaColor {
  pageIndex: number;
  annotationId: number;
}
