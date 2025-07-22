import { WebAlphaColor } from './color';
import { Size, Rect, Position, Rotation, Quad } from './geometry';
import { Task, TaskError } from './task';

/**
 * Representation of pdf page
 *
 * @public
 */
export interface PdfPageObject {
  /**
   * Index of this page, starts from 0
   */
  index: number;

  /**
   * Orignal size of this page
   */
  size: Size;
}

/**
 * Representation of pdf page with rotated size
 *
 * @public
 */
export interface PdfPageObjectWithRotatedSize extends PdfPageObject {
  /**
   * Rotated size of this page
   */
  rotatedSize: Size;
}

/**
 * Representation of pdf document
 *
 * @public
 */
export interface PdfDocumentObject {
  /**
   * Identity of document
   */
  id: string;

  /**
   * Count of pages in this document
   */
  pageCount: number;

  /**
   * Pages in this document
   */
  pages: PdfPageObject[];
}

/**
 * metadata of pdf document
 *
 * @public
 */
export interface PdfMetadataObject {
  /**
   * title of the document
   */
  title: string;
  /**
   * author of the document
   */
  author: string;
  /**
   * subject of the document
   */
  subject: string;
  /**
   * keywords of the document
   */
  keywords: string;
  /**
   * producer of the document
   */
  producer: string;
  /**
   * creator of the document
   */
  creator: string;
  /**
   * creation date of the document
   */
  creationDate: string;
  /**
   * modification date of the document
   */
  modificationDate: string;
}

/**
 * Unicode **soft-hyphen** marker (`U+00AD`).
 * Often embedded by PDF generators as discretionary hyphens.
 *
 * @public
 */
export const PdfSoftHyphenMarker = '\u00AD';

/**
 * Unicode **zero-width space** (`U+200B`).
 *
 * @public
 */
export const PdfZeroWidthSpace = '\u200B';

/**
 * Unicode **word-joiner** (`U+2060`) – zero-width no-break.
 *
 * @public
 */
export const PdfWordJoiner = '\u2060';

/**
 * Unicode **byte-order mark / zero-width&nbsp;no-break space** (`U+FEFF`).
 *
 * @public
 */
export const PdfBomOrZwnbsp = '\uFEFF';

/**
 * Unicode non-character `U+FFFE`.
 *
 * @public
 */
export const PdfNonCharacterFFFE = '\uFFFE';

/**
 * Unicode non-character `U+FFFF`.
 *
 * @public
 */
export const PdfNonCharacterFFFF = '\uFFFF';

/**
 * **Frozen list** of all unwanted markers in canonical order.
 *
 * @public
 */
export const PdfUnwantedTextMarkers = Object.freeze([
  PdfSoftHyphenMarker,
  PdfZeroWidthSpace,
  PdfWordJoiner,
  PdfBomOrZwnbsp,
  PdfNonCharacterFFFE,
  PdfNonCharacterFFFF,
] as const);

/**
 * Compiled regular expression that matches any unwanted marker.
 *
 * @public
 */
export const PdfUnwantedTextRegex = new RegExp(`[${PdfUnwantedTextMarkers.join('')}]`, 'g');

/**
 * Remove all {@link PdfUnwantedTextMarkers | unwanted markers} from *text*.
 *
 * @param text - raw text extracted from PDF
 * @returns cleaned text
 *
 * @public
 */
export function stripPdfUnwantedMarkers(text: string): string {
  return text.replace(PdfUnwantedTextRegex, '');
}

/**
 * zoom mode
 *
 * @public
 */
export enum PdfZoomMode {
  Unknown = 0,
  /**
   * Zoom level with specified offset.
   */
  XYZ = 1,
  /**
   * Fit both the width and height of the page (whichever smaller).
   */
  FitPage = 2,
  /**
   * Fit the page width.
   */
  FitHorizontal = 3,
  /**
   * Fit the page height.
   */
  FitVertical = 4,
  /**
   * Fit a specific rectangle area within the window.
   */
  FitRectangle = 5,
}

/**
 * Blend mode
 *
 * @public
 */
export enum PdfBlendMode {
  Normal = 0,
  Multiply = 1,
  Screen = 2,
  Overlay = 3,
  Darken = 4,
  Lighten = 5,
  ColorDodge = 6,
  ColorBurn = 7,
  HardLight = 8,
  SoftLight = 9,
  Difference = 10,
  Exclusion = 11,
  Hue = 12,
  Saturation = 13,
  Color = 14,
  Luminosity = 15,
}

/** Extra UI sentinel for “multiple different values selected”. */
export const MixedBlendMode = Symbol('mixed');
export type UiBlendModeValue = PdfBlendMode | typeof MixedBlendMode;

interface BlendModeInfo {
  /** Pdf enum value */
  id: PdfBlendMode;
  /** Human label for UI */
  label: string;
  /** CSS mix-blend-mode token */
  css: string;
}

/** Canonical ordered descriptor list (matches enum numeric order). */
const BLEND_MODE_INFOS: readonly BlendModeInfo[] = Object.freeze([
  { id: PdfBlendMode.Normal, label: 'Normal', css: 'normal' },
  { id: PdfBlendMode.Multiply, label: 'Multiply', css: 'multiply' },
  { id: PdfBlendMode.Screen, label: 'Screen', css: 'screen' },
  { id: PdfBlendMode.Overlay, label: 'Overlay', css: 'overlay' },
  { id: PdfBlendMode.Darken, label: 'Darken', css: 'darken' },
  { id: PdfBlendMode.Lighten, label: 'Lighten', css: 'lighten' },
  { id: PdfBlendMode.ColorDodge, label: 'Color Dodge', css: 'color-dodge' },
  { id: PdfBlendMode.ColorBurn, label: 'Color Burn', css: 'color-burn' },
  { id: PdfBlendMode.HardLight, label: 'Hard Light', css: 'hard-light' },
  { id: PdfBlendMode.SoftLight, label: 'Soft Light', css: 'soft-light' },
  { id: PdfBlendMode.Difference, label: 'Difference', css: 'difference' },
  { id: PdfBlendMode.Exclusion, label: 'Exclusion', css: 'exclusion' },
  { id: PdfBlendMode.Hue, label: 'Hue', css: 'hue' },
  { id: PdfBlendMode.Saturation, label: 'Saturation', css: 'saturation' },
  { id: PdfBlendMode.Color, label: 'Color', css: 'color' },
  { id: PdfBlendMode.Luminosity, label: 'Luminosity', css: 'luminosity' },
]);

/* Build O(1) maps once */
const enumToInfo: Record<PdfBlendMode, BlendModeInfo> = BLEND_MODE_INFOS.reduce(
  (m, info) => {
    m[info.id] = info;
    return m;
  },
  {} as Record<PdfBlendMode, BlendModeInfo>,
);

const cssToEnum = BLEND_MODE_INFOS.reduce<Record<string, PdfBlendMode>>((m, info) => {
  m[info.css] = info.id;
  return m;
}, {});

/** Get descriptor (falls back to Normal if unknown number sneaks in).
 *
 * @public
 */
export function getBlendModeInfo(mode: PdfBlendMode): BlendModeInfo {
  return enumToInfo[mode] ?? enumToInfo[PdfBlendMode.Normal];
}

/** Convert enum → CSS value for `mix-blend-mode`.
 *
 * @public
 */
export function blendModeToCss(mode: PdfBlendMode): string {
  return getBlendModeInfo(mode).css;
}

/** Convert CSS token → enum (returns undefined if not recognized).
 *
 * @public
 */
export function cssToBlendMode(value: string): PdfBlendMode | undefined {
  return cssToEnum[value as keyof typeof cssToEnum];
}

/** Enum → UI label.
 *
 * @public
 */
export function blendModeLabel(mode: PdfBlendMode): string {
  return getBlendModeInfo(mode).label;
}

/**
 * For a selection of annotations: returns the common enum value, or Mixed sentinel.
 *
 * @public
 */
export function reduceBlendModes(modes: readonly PdfBlendMode[]): UiBlendModeValue {
  if (!modes.length) return PdfBlendMode.Normal;
  const first = modes[0];
  return modes.every((m) => m === first) ? first : MixedBlendMode;
}

/** Options for a <select>.
 *
 * @public
 */
export const blendModeSelectOptions = BLEND_MODE_INFOS.map((info) => ({
  value: info.id,
  label: info.label,
}));

/** Provide a label when Mixed sentinel used (UI convenience).
 *
 * @public
 */
export function uiBlendModeDisplay(value: UiBlendModeValue): string {
  return value === MixedBlendMode ? '(mixed)' : blendModeLabel(value);
}

/**
 * Representation of the linked destination
 *
 * @public
 */
export interface PdfDestinationObject {
  /**
   * Index of target page
   */
  pageIndex: number;
  /**
   * zoom config for target destination
   */
  zoom:
    | {
        mode: PdfZoomMode.Unknown;
      }
    | { mode: PdfZoomMode.XYZ; params: { x: number; y: number; zoom: number } }
    | {
        mode: PdfZoomMode.FitPage;
      }
    | {
        mode: PdfZoomMode.FitHorizontal;
      }
    | {
        mode: PdfZoomMode.FitVertical;
      }
    | {
        mode: PdfZoomMode.FitRectangle;
      };
  view: number[];
}

/**
 * Type of pdf action
 *
 * @public
 */
export enum PdfActionType {
  Unsupported = 0,
  /**
   * Goto specified position in this document
   */
  Goto = 1,
  /**
   * Goto specified position in another document
   */
  RemoteGoto = 2,
  /**
   * Goto specified URI
   */
  URI = 3,
  /**
   * Launch specifed application
   */
  LaunchAppOrOpenFile = 4,
}

export type PdfImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/**
 * Representation of pdf action
 *
 * @public
 */
export type PdfActionObject =
  | {
      type: PdfActionType.Unsupported;
    }
  | {
      type: PdfActionType.Goto;
      destination: PdfDestinationObject;
    }
  | {
      type: PdfActionType.RemoteGoto;
      destination: PdfDestinationObject;
    }
  | {
      type: PdfActionType.URI;
      uri: string;
    }
  | {
      type: PdfActionType.LaunchAppOrOpenFile;
      path: string;
    };

/**
 * target of pdf link
 *
 * @public
 */
export type PdfLinkTarget =
  | {
      type: 'action';
      action: PdfActionObject;
    }
  | {
      type: 'destination';
      destination: PdfDestinationObject;
    };

/**
 * PDF bookmark
 *
 * @public
 */
export interface PdfBookmarkObject {
  /**
   * title of bookmark
   */
  title: string;

  /**
   * target of bookmark
   */
  target?: PdfLinkTarget | undefined;

  /**
   * bookmarks in the next level
   */
  children?: PdfBookmarkObject[];
}

/**
 * Pdf Signature
 *
 * @public
 */
export interface PdfSignatureObject {
  /**
   * contents of signature
   */
  contents: ArrayBuffer;

  /**
   * byte range of signature
   */
  byteRange: ArrayBuffer;

  /**
   * sub filters of signature
   */
  subFilter: ArrayBuffer;

  /**
   * reason of signature
   */
  reason: string;

  /**
   * creation time of signature
   */
  time: string;

  /**
   * MDP
   */
  docMDP: number;
}

/**
 * Bookmark tree of pdf
 *
 * @public
 */
export interface PdfBookmarksObject {
  bookmarks: PdfBookmarkObject[];
}

/**
 * Text rectangle in pdf page
 *
 * @public
 */
export interface PdfTextRectObject {
  /**
   * Font of the text
   */
  font: {
    /**
     * font family
     */
    family: string;

    /**
     * font size
     */
    size: number;
  };

  /**
   * content in this rectangle area
   */
  content: string;

  /**
   * rectangle of the text
   */
  rect: Rect;
}

/**
 * Color
 *
 * @public
 */
export interface PdfAlphaColor {
  /**
   * red
   */
  red: number;
  /**
   * green
   */
  green: number;
  /**
   * blue
   */
  blue: number;
  /**
   * alpha
   */
  alpha: number;
}

/**
 * Annotation type
 *
 * @public
 */
export enum PdfAnnotationSubtype {
  UNKNOWN = 0,
  TEXT,
  LINK,
  FREETEXT,
  LINE,
  SQUARE,
  CIRCLE,
  POLYGON,
  POLYLINE,
  HIGHLIGHT,
  UNDERLINE,
  SQUIGGLY,
  STRIKEOUT,
  STAMP,
  CARET,
  INK,
  POPUP,
  FILEATTACHMENT,
  SOUND,
  MOVIE,
  WIDGET,
  SCREEN,
  PRINTERMARK,
  TRAPNET,
  WATERMARK,
  THREED,
  RICHMEDIA,
  XFAWIDGET,
  REDACT,
}

/**
 * Name of annotation type
 *
 * @public
 */
export const PdfAnnotationSubtypeName: Record<PdfAnnotationSubtype, string> = {
  [PdfAnnotationSubtype.UNKNOWN]: 'unknow',
  [PdfAnnotationSubtype.TEXT]: 'text',
  [PdfAnnotationSubtype.LINK]: 'link',
  [PdfAnnotationSubtype.FREETEXT]: 'freetext',
  [PdfAnnotationSubtype.LINE]: 'line',
  [PdfAnnotationSubtype.SQUARE]: 'square',
  [PdfAnnotationSubtype.CIRCLE]: 'circle',
  [PdfAnnotationSubtype.POLYGON]: 'polygon',
  [PdfAnnotationSubtype.POLYLINE]: 'polyline',
  [PdfAnnotationSubtype.HIGHLIGHT]: 'highlight',
  [PdfAnnotationSubtype.UNDERLINE]: 'underline',
  [PdfAnnotationSubtype.SQUIGGLY]: 'squiggly',
  [PdfAnnotationSubtype.STRIKEOUT]: 'strikeout',
  [PdfAnnotationSubtype.STAMP]: 'stamp',
  [PdfAnnotationSubtype.CARET]: 'caret',
  [PdfAnnotationSubtype.INK]: 'ink',
  [PdfAnnotationSubtype.POPUP]: 'popup',
  [PdfAnnotationSubtype.FILEATTACHMENT]: 'fileattachment',
  [PdfAnnotationSubtype.SOUND]: 'sound',
  [PdfAnnotationSubtype.MOVIE]: 'movie',
  [PdfAnnotationSubtype.WIDGET]: 'widget',
  [PdfAnnotationSubtype.SCREEN]: 'screen',
  [PdfAnnotationSubtype.PRINTERMARK]: 'printermark',
  [PdfAnnotationSubtype.TRAPNET]: 'trapnet',
  [PdfAnnotationSubtype.WATERMARK]: 'watermark',
  [PdfAnnotationSubtype.THREED]: 'threed',
  [PdfAnnotationSubtype.RICHMEDIA]: 'richmedia',
  [PdfAnnotationSubtype.XFAWIDGET]: 'xfawidget',
  [PdfAnnotationSubtype.REDACT]: 'redact',
};

/**
 * Status of pdf annotation
 *
 * @public
 */
export enum PdfAnnotationObjectStatus {
  /**
   * Annotation is created
   */
  Created,
  /**
   * Annotation is committed to PDF file
   */
  Committed,
}

/**
 * Appearance mode
 *
 * @public
 */
export enum AppearanceMode {
  Normal = 0,
  Rollover = 1,
  Down = 2,
}

/**
 * State of pdf annotation
 *
 * @public
 */
export enum PdfAnnotationState {
  /**
   * Annotation is active
   */
  Marked = 'Marked',
  /**
   * Annotation is unmarked
   */
  Unmarked = 'Unmarked',
  /**
   * Annotation is ink
   */
  Accepted = 'Accepted',
  /**
   * Annotation is rejected
   */
  Rejected = 'Rejected',
  /**
   * Annotation is complete
   */
  Complete = 'Complete',
  /**
   * Annotation is cancelled
   */
  Cancelled = 'Cancelled',
  /**
   * Annotation is none
   */
  None = 'None',
}

/**
 * State model of pdf annotation
 *
 * @public
 */
export enum PdfAnnotationStateModel {
  /**
   * Annotation is marked
   */
  Marked = 'Marked',
  /**
   * Annotation is reviewed
   */
  Reviewed = 'Reviewed',
}

/**
 * Basic information of pdf annotation
 *
 * @public
 */
export interface PdfAnnotationObjectBase {
  /**
   * Author of the annotation
   */
  author?: string;

  /**
   * Modified date of the annotation
   */
  modified?: Date;

  /**
   * blend mode of annotation
   */
  blendMode?: PdfBlendMode;

  /**
   * intent of annotation
   */
  intent?: string;

  /**
   * Sub type of annotation
   */
  type: PdfAnnotationSubtype;

  /**
   * The index of page that this annotation belong to
   */
  pageIndex: number;

  /**
   * id of the annotation
   */
  id: number;

  /**
   * Rectangle of the annotation
   */
  rect: Rect;
}

/**
 * Popup annotation
 *
 * @public
 */
export interface PdfPopupAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.POPUP;
  /**
   * Contents of the popup
   */
  contents: string;

  /**
   * Whether the popup is opened or not
   */
  open: boolean;

  /**
   * In reply to id
   */
  inReplyToId?: number;
}

/**
 * Pdf Link annotation
 *
 * @public
 */
export interface PdfLinkAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.LINK;
  /**
   * Text of the link
   */
  text: string;
  /**
   * target of the link
   */
  target: PdfLinkTarget | undefined;
}

/**
 * Pdf Text annotation
 *
 * @public
 */
export interface PdfTextAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.TEXT;
  /**
   * Text contents of the annotation
   */
  contents: string;

  /**
   * color of text annotation
   */
  color?: string;

  /**
   * opacity of text annotation
   */
  opacity?: number;

  /**
   * In reply to id
   */
  inReplyToId?: number;

  /**
   * State of the text annotation
   */
  state?: PdfAnnotationState;

  /**
   * State model of the text annotation
   */
  stateModel?: PdfAnnotationStateModel;
}

/**
 * Type of form field
 *
 * @public
 */
export enum PDF_FORM_FIELD_TYPE {
  /**
   * Unknow
   */
  UNKNOWN = 0,
  /**
   * push button type
   */
  PUSHBUTTON = 1,
  /**
   * check box type.
   */
  CHECKBOX = 2,
  /**
   * radio button type.
   */
  RADIOBUTTON = 3,
  /**
   * combo box type.
   */
  COMBOBOX = 4,
  /**
   * list box type.
   */
  LISTBOX = 5,
  /**
   *  text field type
   */
  TEXTFIELD = 6,
  /**
   * signature field type.
   */
  SIGNATURE = 7,
  /**
   * Generic XFA type.
   */
  XFA = 8,
  /**
   * XFA check box type.
   */
  XFA_CHECKBOX = 9,
  /**
   * XFA combo box type.
   */
  XFA_COMBOBOX = 10,
  /**
   * XFA image field type.
   */
  XFA_IMAGEFIELD = 11,
  /**
   * XFA list box type.
   */
  XFA_LISTBOX = 12,
  /**
   * XFA push button type.
   */
  XFA_PUSHBUTTON = 13,
  /**
   * XFA signture field type.
   */
  XFA_SIGNATURE = 14,
  /**
   * XFA text field type.
   */
  XFA_TEXTFIELD = 15,
}

export enum PdfAnnotationColorType {
  Color = 0,
  InteriorColor = 1,
}

/**
 * Border style of pdf annotation
 *
 * @public
 */
export enum PdfAnnotationBorderStyle {
  UNKNOWN = 0,
  SOLID = 1,
  DASHED = 2,
  BEVELED = 3,
  INSET = 4,
  UNDERLINE = 5,
  CLOUDY = 6,
}

/**
 * Flag of pdf annotation
 *
 * @public
 */
export enum PdfAnnotationFlags {
  NONE = 0,
  INVISIBLE = 1 << 0,
  HIDDEN = 1 << 1,
  PRINT = 1 << 2,
  NO_ZOOM = 1 << 3,
  NO_ROTATE = 1 << 4,
  NO_VIEW = 1 << 5,
  READ_ONLY = 1 << 6,
  LOCKED = 1 << 7,
  TOGGLE_NOVIEW = 1 << 8,
}

/**
 * Flag of form field
 *
 * @public
 */
export enum PDF_FORM_FIELD_FLAG {
  NONE = 0,
  READONLY = 1 << 0,
  REQUIRED = 1 << 1,
  NOEXPORT = 1 << 2,
  TEXT_MULTIPLINE = 1 << 12,
  TEXT_PASSWORD = 1 << 13,
  CHOICE_COMBO = 1 << 17,
  CHOICE_EDIT = 1 << 18,
  CHOICE_MULTL_SELECT = 1 << 21,
}

/**
 * Type of pdf object
 *
 * @public
 */
export enum PdfPageObjectType {
  UNKNOWN = 0,
  TEXT = 1,
  PATH = 2,
  IMAGE = 3,
  SHADING = 4,
  FORM = 5,
}

/**
 * Options of pdf widget annotation
 *
 * @public
 */
export interface PdfWidgetAnnoOption {
  label: string;
  isSelected: boolean;
}

export type PdfAnnotationFlagName =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView';

type FlagMap = Partial<
  Record<Exclude<PdfAnnotationFlags, PdfAnnotationFlags.NONE>, PdfAnnotationFlagName>
>;

export const PdfAnnotationFlagName: Readonly<FlagMap> = Object.freeze({
  [PdfAnnotationFlags.INVISIBLE]: 'invisible',
  [PdfAnnotationFlags.HIDDEN]: 'hidden',
  [PdfAnnotationFlags.PRINT]: 'print',
  [PdfAnnotationFlags.NO_ZOOM]: 'noZoom',
  [PdfAnnotationFlags.NO_ROTATE]: 'noRotate',
  [PdfAnnotationFlags.NO_VIEW]: 'noView',
  [PdfAnnotationFlags.READ_ONLY]: 'readOnly',
  [PdfAnnotationFlags.LOCKED]: 'locked',
  [PdfAnnotationFlags.TOGGLE_NOVIEW]: 'toggleNoView',
} as const);

/** Build a reverse map once so look-ups are O(1)                      */
const PdfAnnotationFlagValue: Record<PdfAnnotationFlagName, PdfAnnotationFlags> = Object.entries(
  PdfAnnotationFlagName,
).reduce(
  (acc, [bit, name]) => {
    acc[name as PdfAnnotationFlagName] = Number(bit) as PdfAnnotationFlags;
    return acc;
  },
  {} as Record<PdfAnnotationFlagName, PdfAnnotationFlags>,
);

/**
 * Convert the raw bit-mask coming from `FPDFAnnot_GetFlags()` into
 * an array of human-readable flag names (“invisible”, “print”…).
 */
export function flagsToNames(raw: number): PdfAnnotationFlagName[] {
  return (
    Object.keys(PdfAnnotationFlagName) as unknown as Exclude<
      PdfAnnotationFlags,
      PdfAnnotationFlags.NONE
    >[]
  )
    .filter((flag) => (raw & flag) !== 0)
    .map((flag) => PdfAnnotationFlagName[flag]!);
}

/**
 * Convert an array of flag-names back into the numeric mask that
 * PDFium expects for `FPDFAnnot_SetFlags()`.
 */
export function namesToFlags(names: readonly PdfAnnotationFlagName[]): PdfAnnotationFlags {
  return names.reduce<PdfAnnotationFlags>(
    (mask, name) => mask | PdfAnnotationFlagValue[name],
    PdfAnnotationFlags.NONE,
  );
}

/**
 * Field of PDF widget annotation
 *
 * @public
 */
export interface PdfWidgetAnnoField {
  /**
   * flag of field
   */
  flag: PDF_FORM_FIELD_FLAG;
  /**
   * name of field
   */
  name: string;
  /**
   * alternate name of field
   */
  alternateName: string;
  /**
   * type of field
   */
  type: PDF_FORM_FIELD_TYPE;
  /**
   * value of field
   */
  value: string;
  /**
   * whether field is checked
   */
  isChecked: boolean;
  /**
   * options of field
   */
  options: PdfWidgetAnnoOption[];
}

/**
 * PDF widget object
 *
 * @public
 */
export interface PdfWidgetAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.WIDGET;
  /**
   * Field of pdf widget object
   */
  field: PdfWidgetAnnoField;
}

/**
 * Pdf file attachments annotation
 *
 * @public
 */
export interface PdfFileAttachmentAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.FILEATTACHMENT;
}

/**
 * ink list in pdf ink annotation
 *
 * @public
 */
export interface PdfInkListObject {
  points: Position[];
}

/**
 * Pdf ink annotation
 *
 * @public
 */
export interface PdfInkAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.INK;
  /**
   * ink list of annotation
   */
  inkList: PdfInkListObject[];
  /**
   * color of ink annotation
   */
  color: string;

  /**
   * opacity of ink annotation
   */
  opacity: number;

  /**
   * stroke-width of ink annotation
   */
  strokeWidth: number;
}

/**
 * Pdf polygon annotation
 *
 * @public
 */
export interface PdfPolygonAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.POLYGON;
  /**
   * vertices of annotation
   */
  vertices: Position[];
}

/**
 * PDF polyline annotation
 *
 * @public
 */
export interface PdfPolylineAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.POLYLINE;
  /**
   * vertices of annotation
   */
  vertices: Position[];
}

/**
 * PDF line annotation
 *
 * @public
 */
export interface PdfLineAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.LINE;
  /**
   * start point of line
   */
  startPoint: Position;
  /**
   * end point of line
   */
  endPoint: Position;
}

/**
 * PDF highlight annotation
 *
 * @public
 */
export interface PdfHighlightAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.HIGHLIGHT;

  /**
   * Text contents of the highlight annotation
   */
  contents?: string;

  /**
   * color of highlight annotation
   */
  color: string;

  /**
   * opacity of highlight annotation
   */
  opacity: number;

  /**
   * quads of highlight area
   */
  segmentRects: Rect[];
}

/**
 * Matrix for transformation, in the form [a b c d e f], equivalent to:
 * | a  b  0 |
 * | c  d  0 |
 * | e  f  1 |
 *
 * Translation is performed with [1 0 0 1 tx ty].
 * Scaling is performed with [sx 0 0 sy 0 0].
 * See PDF Reference 1.7, 4.2.2 Common Transformations for more.
 */
export interface PdfTransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * type of segment type in pdf path object
 *
 * @public
 */
export enum PdfSegmentObjectType {
  UNKNOWN = -1,
  LINETO = 0,
  BEZIERTO = 1,
  MOVETO = 2,
}

/**
 * segment of path object
 *
 * @public
 */
export interface PdfSegmentObject {
  type: PdfSegmentObjectType;
  /**
   * point of the segment
   */
  point: Position;
  /**
   * whether this segment close the path
   */
  isClosed: boolean;
}

/**
 * Pdf path object
 *
 * @public
 */
export interface PdfPathObject {
  type: PdfPageObjectType.PATH;
  /**
   * bound that contains the path
   */
  bounds: { left: number; bottom: number; right: number; top: number };
  /**
   * segments of the path
   */
  segments: PdfSegmentObject[];
  /**
   * transform matrix
   */
  matrix: PdfTransformMatrix;
}

/**
 * Pdf image object
 *
 * @public
 */
export interface PdfImageObject {
  type: PdfPageObjectType.IMAGE;
  /**
   * data of the image
   */
  imageData: ImageData;
  /**
   * transform matrix
   */
  matrix: PdfTransformMatrix;
}

/**
 * Pdf form object
 *
 * @public
 */
export interface PdfFormObject {
  type: PdfPageObjectType.FORM;
  /**
   * objects that in this form object
   */
  objects: (PdfImageObject | PdfPathObject | PdfFormObject)[];
  /**
   * transform matrix
   */
  matrix: PdfTransformMatrix;
}

/**
 * Contents type of pdf stamp annotation
 *
 * @public
 */
export type PdfStampAnnoObjectContents = Array<PdfPathObject | PdfImageObject | PdfFormObject>;

/**
 * Pdf stamp annotation
 *
 * @public
 */
export interface PdfStampAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.STAMP;
  /**
   * contents in this stamp annotation
   */
  contents: PdfStampAnnoObjectContents;
}

/**
 * Pdf circle annotation
 *
 * @public
 */
export interface PdfCircleAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.CIRCLE;
  /**
   * flags of circle annotation
   */
  flags: PdfAnnotationFlagName[];
  /**
   * color of circle annotation
   */
  color: string;
  /**
   * opacity of circle annotation
   */
  opacity: number;
  /**
   * stroke-width of circle annotation
   */
  strokeWidth: number;
  /**
   * stroke color of circle annotation
   */
  strokeColor: string;
  /**
   * stroke style of circle annotation
   */
  strokeStyle: PdfAnnotationBorderStyle;
  /**
   * stroke dash array of circle annotation
   */
  strokeDashArray?: number[];
  /**
   * cloudy border intensity of circle annotation
   */
  cloudyBorderIntensity?: number;
  /**
   * cloudy border inset of circle annotation
   */
  cloudyBorderInset?: number[];
}

/**
 * Pdf square annotation
 *
 * @public
 */
export interface PdfSquareAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.SQUARE;
  /**
   * flags of square annotation
   */
  flags: PdfAnnotationFlagName[];
  /**
   * color of square annotation
   */
  color: string;
  /**
   * opacity of square annotation
   */
  opacity: number;
  /**
   * stroke-width of square annotation
   */
  strokeWidth: number;
  /**
   * stroke color of square annotation
   */
  strokeColor: string;
  /**
   * stroke style of square annotation
   */
  strokeStyle: PdfAnnotationBorderStyle;
  /**
   * stroke dash array of square annotation
   */
  strokeDashArray?: number[];
  /**
   * cloudy border intensity of circle annotation
   */
  cloudyBorderIntensity?: number;
  /**
   * cloudy border inset of circle annotation
   */
  cloudyBorderInset?: number[];
}

/**
 * Pdf squiggly annotation
 *
 * @public
 */
export interface PdfSquigglyAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.SQUIGGLY;
  /**
   * Text contents of the highlight annotation
   */
  contents?: string;
  /**
   * color of strike out annotation
   */
  color: string;

  /**
   * opacity of strike out annotation
   */
  opacity: number;
  /**
   * quads of highlight area
   */
  segmentRects: Rect[];
}

/**
 * Pdf underline annotation
 *
 * @public
 */
export interface PdfUnderlineAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.UNDERLINE;
  /**
   * Text contents of the highlight annotation
   */
  contents?: string;
  /**
   * color of strike out annotation
   */
  color: string;

  /**
   * opacity of strike out annotation
   */
  opacity: number;
  /**
   * quads of highlight area
   */
  segmentRects: Rect[];
}

/**
 * Pdf strike out annotation
 *
 * @public
 */
export interface PdfStrikeOutAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.STRIKEOUT;
  /**
   * Text contents of the strike out annotation
   */
  contents?: string;

  /**
   * color of strike out annotation
   */
  color: string;

  /**
   * opacity of strike out annotation
   */
  opacity: number;

  /**
   * quads of highlight area
   */
  segmentRects: Rect[];
}

/**
 * Pdf caret annotation
 *
 * @public
 */
export interface PdfCaretAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.CARET;
}

/**
 * Pdf free text annotation
 *
 * @public
 */
export interface PdfFreeTextAnnoObject extends PdfAnnotationObjectBase {
  /** {@inheritDoc PdfAnnotationObjectBase.type} */
  type: PdfAnnotationSubtype.FREETEXT;
  contents: string;
  richContent?: string;
}

/**
 * All annotation that support
 *
 * @public
 */
export type PdfSupportedAnnoObject =
  | PdfInkAnnoObject
  | PdfTextAnnoObject
  | PdfLinkAnnoObject
  | PdfPolygonAnnoObject
  | PdfPolylineAnnoObject
  | PdfHighlightAnnoObject
  | PdfLineAnnoObject
  | PdfWidgetAnnoObject
  | PdfFileAttachmentAnnoObject
  | PdfStampAnnoObject
  | PdfSquareAnnoObject
  | PdfCircleAnnoObject
  | PdfSquigglyAnnoObject
  | PdfUnderlineAnnoObject
  | PdfStrikeOutAnnoObject
  | PdfCaretAnnoObject
  | PdfFreeTextAnnoObject;

/**
 * Pdf annotation that does not support
 *
 * @public
 */
export interface PdfUnsupportedAnnoObject extends PdfAnnotationObjectBase {
  type: Exclude<PdfAnnotationSubtype, PdfSupportedAnnoObject['type']>;
}

/**
 * all annotations
 *
 * @public
 */
export type PdfAnnotationObject = PdfSupportedAnnoObject | PdfUnsupportedAnnoObject;

/**
 * Pdf attachment
 *
 * @public
 */
export interface PdfAttachmentObject {
  index: number;
  name: string;
  creationDate: string;
  checksum: string;
}

/**
 * Pdf engine features
 *
 * @public
 */
export enum PdfEngineFeature {
  RenderPage,
  RenderPageRect,
  Thumbnails,
  Bookmarks,
  Annotations,
}

/**
 * All operations for this engine
 *
 * @public
 */
export enum PdfEngineOperation {
  Create,
  Read,
  Update,
  Delete,
}

/**
 * flags to match the text during searching
 *
 * @public
 */
export enum MatchFlag {
  None = 0,
  MatchCase = 1,
  MatchWholeWord = 2,
  MatchConsecutive = 4,
}

/**
 * Union all the flags
 * @param flags - all the flags
 * @returns union of flags
 *
 * @public
 */
export function unionFlags(flags: MatchFlag[]) {
  return flags.reduce((flag, currFlag) => {
    return flag | currFlag;
  }, MatchFlag.None);
}

/**
 * Image conversion types
 *
 * @public
 */
export type ImageConversionTypes = 'image/webp' | 'image/png' | 'image/jpeg';

/**
 * Targe for searching
 *
 * @public
 */
export interface SearchTarget {
  keyword: string;
  flags: MatchFlag[];
}

/**
 * compare 2 search target
 * @param targetA - first target for search
 * @param targetB - second target for search
 * @returns whether 2 search target are the same
 *
 * @public
 */
export function compareSearchTarget(targetA: SearchTarget, targetB: SearchTarget) {
  const flagA = unionFlags(targetA.flags);
  const flagB = unionFlags(targetB.flags);

  return flagA === flagB && targetA.keyword === targetB.keyword;
}

/** Context of one hit */
export interface TextContext {
  /** Complete words that come *before* the hit (no ellipsis)            */
  before: string;
  /** Exactly the text that matched (case-preserved)                      */
  match: string;
  /** Complete words that come *after* the hit (no ellipsis)             */
  after: string;
  /** `true` ⇢ there were more words on the left that we cut off         */
  truncatedLeft: boolean;
  /** `true` ⇢ there were more words on the right that we cut off        */
  truncatedRight: boolean;
}

/**
 * Text slice
 *
 * @public
 */
export interface PageTextSlice {
  /**
   * Index of the pdf page
   */
  pageIndex: number;
  /**
   * Index of the first character
   */
  charIndex: number;
  /**
   * Count of the characters
   */
  charCount: number;
}

/**
 * search result
 *
 * @public
 */
export interface SearchResult {
  /**
   * Index of the pdf page
   */
  pageIndex: number;
  /**
   * index of the first character
   */
  charIndex: number;
  /**
   * count of the characters
   */
  charCount: number;
  /**
   * highlight rects
   */
  rects: Rect[];
  /**
   * context of the hit
   */
  context: TextContext;
}

/**
 * Results of searching through the entire document
 */
export interface SearchAllPagesResult {
  /**
   * Array of all search results across all pages
   */
  results: SearchResult[];

  /**
   * Total number of results found
   */
  total: number;
}

/**
 * Glyph object
 *
 * @public
 */
export interface PdfGlyphObject {
  /**
   * Origin of the glyph
   */
  origin: { x: number; y: number };
  /**
   * Size of the glyph
   */
  size: { width: number; height: number };
  /**
   * Whether the glyph is a space
   */
  isSpace?: boolean;
  /**
   * Whether the glyph is a empty
   */
  isEmpty?: boolean;
}

/**
 * Glyph object
 *
 * @public
 */
export interface PdfGlyphSlim {
  /**
   * X coordinate of the glyph
   */
  x: number;
  /**
   * Y coordinate of the glyph
   */
  y: number;
  /**
   * Width of the glyph
   */
  width: number;
  /**
   * Height of the glyph
   */
  height: number;
  /**
   * Flags of the glyph
   */
  flags: number;
}

/**
 * Run object
 *
 * @public
 */
export interface PdfRun {
  /**
   * Rectangle of the run
   */
  rect: { x: number; y: number; width: number; height: number };
  /**
   * Start index of the run
   */
  charStart: number;
  /**
   * Glyphs of the run
   */
  glyphs: PdfGlyphSlim[];
}

/**
 * Page geometry
 *
 * @public
 */
export interface PdfPageGeometry {
  /**
   * Runs of the page
   */
  runs: PdfRun[];
}

/**
 * form field value
 * @public
 */
export type FormFieldValue =
  | { kind: 'text'; text: string }
  | { kind: 'selection'; index: number; isSelected: boolean }
  | { kind: 'checked'; isChecked: boolean };

/**
 * Transformation that will be applied to annotation
 *
 * @public
 */
export interface PdfAnnotationTransformation {
  /**
   * Translated offset
   */
  offset: Position;
  /**
   * Scaled factors
   */
  scale: Size;
}

/**
 * Render options
 *
 * @public
 */
export interface PdfRenderOptions {
  /**
   * Whether needs to render the page with annotations
   */
  withAnnotations: boolean;
}

/**
 * source can be byte array contains pdf content
 *
 * @public
 */
export type PdfFileContent = ArrayBuffer;

export enum PdfPermission {
  PrintDocument = 2 ** 3,
  ModifyContent = 2 ** 4,
  CopyOrExtract = 2 ** 5,
  AddOrModifyTextAnnot = 2 ** 6,
  FillInExistingForm = 2 ** 9,
  ExtractTextOrGraphics = 2 ** 10,
  AssembleDocument = 2 ** 11,
  PrintHighQuality = 2 ** 12,
}

export enum PdfPageFlattenFlag {
  Display = 0,
  Print = 1,
}

export enum PdfPageFlattenResult {
  Fail = 0,
  Success = 1,
  NothingToDo = 2,
}

/**
 * Pdf File without content
 *
 * @public
 */
export interface PdfFileWithoutContent {
  /**
   * id of file
   */
  id: string;
}

export interface PdfFileLoader extends PdfFileWithoutContent {
  /**
   * length of file
   */
  fileLength: number;
  /**
   * read block of file
   * @param offset - offset of file
   * @param length - length of file
   * @returns block of file
   */
  callback: (offset: number, length: number) => Uint8Array;
}

/**
 * Pdf File
 *
 * @public
 */
export interface PdfFile extends PdfFileWithoutContent {
  /**
   * content of file
   */
  content: PdfFileContent;
}

export interface PdfFileUrl extends PdfFileWithoutContent {
  url: string;
}

export interface PdfUrlOptions {
  mode?: 'auto' | 'range-request' | 'full-fetch';
  password?: string;
}

export enum PdfErrorCode {
  Ok, //  #define FPDF_ERR_SUCCESS 0    // No error.
  Unknown, // #define FPDF_ERR_UNKNOWN 1    // Unknown error.
  NotFound, // #define FPDF_ERR_FILE 2       // File not found or could not be opened.
  WrongFormat, // #define FPDF_ERR_FORMAT 3     // File not in PDF format or corrupted.
  Password, // #define FPDF_ERR_PASSWORD 4   // Password required or incorrect password.
  Security, // #define FPDF_ERR_SECURITY 5   // Unsupported security scheme.
  PageError, // #define FPDF_ERR_PAGE 6       // Page not found or content error.
  XFALoad, // #ifdef PDF_ENABLE_XFA
  XFALayout, //
  Cancelled,
  Initialization,
  NotReady,
  NotSupport,
  LoadDoc,
  DocNotOpen,
  CantCloseDoc,
  CantCreateNewDoc,
  CantImportPages,
  CantCreateAnnot,
  CantSetAnnotRect,
  CantSetAnnotContent,
  CantRemoveInkList,
  CantAddInkStoke,
  CantReadAttachmentSize,
  CantReadAttachmentContent,
  CantFocusAnnot,
  CantSelectText,
  CantSelectOption,
  CantCheckField,
}

export interface PdfErrorReason {
  code: PdfErrorCode;
  message: string;
}

export type PdfEngineError = TaskError<PdfErrorReason>;

export type PdfTask<R> = Task<R, PdfErrorReason>;

export class PdfTaskHelper {
  /**
   * Create a task
   * @returns new task
   */
  static create<R>(): Task<R, PdfErrorReason> {
    return new Task<R, PdfErrorReason>();
  }

  /**
   * Create a task that has been resolved with value
   * @param result - resolved value
   * @returns resolved task
   */
  static resolve<R>(result: R): Task<R, PdfErrorReason> {
    const task = new Task<R, PdfErrorReason>();
    task.resolve(result);

    return task;
  }

  /**
   * Create a task that has been rejected with error
   * @param reason - rejected error
   * @returns rejected task
   */
  static reject<T = any>(reason: PdfErrorReason): Task<T, PdfErrorReason> {
    const task = new Task<T, PdfErrorReason>();
    task.reject(reason);

    return task;
  }

  /**
   * Create a task that has been aborted with error
   * @param reason - aborted error
   * @returns aborted task
   */
  static abort<T = any>(reason: PdfErrorReason): Task<T, PdfErrorReason> {
    const task = new Task<T, PdfErrorReason>();
    task.reject(reason);

    return task;
  }
}

/**
 * Pdf engine
 *
 * @public
 */
export interface PdfEngine<T = Blob> {
  /**
   * Check whether pdf engine supports this feature
   * @param feature - which feature want to check
   * @returns support or not
   */
  isSupport?: (feature: PdfEngineFeature) => PdfTask<PdfEngineOperation[]>;
  /**
   * Initialize the engine
   * @returns task that indicate whether initialization is successful
   */
  initialize?: () => PdfTask<boolean>;
  /**
   * Destroy the engine
   * @returns task that indicate whether destroy is successful
   */
  destroy?: () => PdfTask<boolean>;
  /**
   * Open a PDF from a URL with specified mode
   * @param url - The PDF file URL
   * @param options - Additional options including mode (auto, range-request, full-fetch) and password
   * @returns Task that resolves with the PdfDocumentObject or an error
   */
  openDocumentUrl: (file: PdfFileUrl, options?: PdfUrlOptions) => PdfTask<PdfDocumentObject>;
  /**
   * Open pdf document from buffer
   * @param file - pdf file
   * @param password - protected password for this file
   * @returns task that contains the file or error
   */
  openDocumentFromBuffer: (file: PdfFile, password: string) => PdfTask<PdfDocumentObject>;
  /**
   * Open pdf document from loader
   * @param file - pdf file
   * @param password - protected password for this file
   * @returns task that contains the file or error
   */
  openDocumentFromLoader: (file: PdfFileLoader, password: string) => PdfTask<PdfDocumentObject>;
  /**
   * Get the metadata of the file
   * @param doc - pdf document
   * @returns task that contains the metadata or error
   */
  getMetadata: (doc: PdfDocumentObject) => PdfTask<PdfMetadataObject>;
  /**
   * Get permissions of the file
   * @param doc - pdf document
   * @returns task that contains a 32-bit integer indicating permission flags
   */
  getDocPermissions: (doc: PdfDocumentObject) => PdfTask<number>;
  /**
   * Get the user permissions of the file
   * @param doc - pdf document
   * @returns task that contains a 32-bit integer indicating permission flags
   */
  getDocUserPermissions: (doc: PdfDocumentObject) => PdfTask<number>;
  /**
   * Get the signatures of the file
   * @param doc - pdf document
   * @returns task that contains the signatures or error
   */
  getSignatures: (doc: PdfDocumentObject) => PdfTask<PdfSignatureObject[]>;
  /**
   * Get the bookmarks of the file
   * @param doc - pdf document
   * @returns task that contains the bookmarks or error
   */
  getBookmarks: (doc: PdfDocumentObject) => PdfTask<PdfBookmarksObject>;
  /**
   * Render the specified pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @param scaleFactor - factor of scaling
   * @param rotation - rotated angle
   * @param dpr - devicePixelRatio
   * @param options - render options
   * @returns task contains the rendered image or error
   */
  renderPage: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
    options: PdfRenderOptions,
    imageType?: ImageConversionTypes,
  ) => PdfTask<T>;
  /**
   * Render the specified rect of pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @param scaleFactor - factor of scaling
   * @param rotation - rotated angle
   * @param dpr - devicePixelRatio
   * @param rect - target rect
   * @param options - render options
   * @returns task contains the rendered image or error
   */
  renderPageRect: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
    rect: Rect,
    options: PdfRenderOptions,
    imageType?: ImageConversionTypes,
  ) => PdfTask<T>;
  /**
   * Render a single annotation into an ImageData blob.
   *
   * Note:  • honours Display-Matrix, page rotation & DPR
   *        • you decide whether to include the page background
   * @param doc - pdf document
   * @param page - pdf page
   * @param annotation - the annotation to render
   * @param scaleFactor - factor of scaling
   * @param rotation - rotated angle
   * @param dpr - devicePixelRatio
   * @param mode - appearance mode
   */
  renderAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
    mode: AppearanceMode,
    imageType: ImageConversionTypes,
  ): PdfTask<T>;
  /**
   * Get annotations of pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @param scaleFactor - factor of scaling
   * @param rotation - rotated angle
   * @returns task contains the annotations or error
   */
  getPageAnnotations: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
  ) => PdfTask<PdfAnnotationObject[]>;

  /**
   * Change the visible colour (and opacity) of an existing annotation.
   * @param doc - pdf document
   * @param page - pdf page
   * @param annotation - the annotation to recolour
   * @param colour - RGBA color values (0-255 per channel)
   * @param which - 0 = stroke/fill colour (PDFium's "colourType" param)
   * @returns task that indicates whether the operation succeeded
   */
  updateAnnotationColor: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObjectBase,
    color: WebAlphaColor,
    which?: number,
  ) => PdfTask<boolean>;

  /**
   * Create a annotation on specified page
   * @param doc - pdf document
   * @param page - pdf page
   * @param annotation - new annotations
   * @returns task whether the annotations is created successfully
   */
  createPageAnnotation: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ) => PdfTask<number>;
  /**
   * Update a annotation on specified page
   * @param doc - pdf document
   * @param page - pdf page
   * @param annotation - new annotations
   * @returns task that indicates whether the operation succeeded
   */
  updatePageAnnotation: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ) => PdfTask<boolean>;
  /**
   * Remove a annotation on specified page
   * @param doc - pdf document
   * @param page - pdf page
   * @param annotation - new annotations
   * @returns task whether the annotations is removed successfully
   */
  removePageAnnotation: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ) => PdfTask<boolean>;
  /**
   * get all text rects in pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @param scaleFactor - factor of scaling
   * @param rotation - rotated angle
   * @returns task contains the text rects or error
   */
  getPageTextRects: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    scaleFactor: number,
    rotation: Rotation,
  ) => PdfTask<PdfTextRectObject[]>;
  /**
   * Render the thumbnail of specified pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @param scaleFactor - factor of scaling
   * @param rotation - rotated angle
   * @param dpr - devicePixelRatio
   * @param options - render options
   * @returns task contains the rendered image or error
   */
  renderThumbnail: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
  ) => PdfTask<T>;
  /**
   * Search across all pages in the document
   * @param doc - pdf document
   * @param keyword - search keyword
   * @param flags - match flags for search
   * @returns Task contains all search results throughout the document
   */
  searchAllPages: (
    doc: PdfDocumentObject,
    keyword: string,
    flags?: MatchFlag[],
  ) => PdfTask<SearchAllPagesResult>;
  /**
   * Get all annotations in this file
   * @param doc - pdf document
   * @returns task that contains the annotations or error
   */
  getAllAnnotations: (doc: PdfDocumentObject) => PdfTask<Record<number, PdfAnnotationObject[]>>;
  /**
   * Get all attachments in this file
   * @param doc - pdf document
   * @returns task that contains the attachments or error
   */
  getAttachments: (doc: PdfDocumentObject) => PdfTask<PdfAttachmentObject[]>;
  /**
   * Read content of pdf attachment
   * @param doc - pdf document
   * @param attachment - pdf attachments
   * @returns task that contains the content of specified attachment or error
   */
  readAttachmentContent: (
    doc: PdfDocumentObject,
    attachment: PdfAttachmentObject,
  ) => PdfTask<ArrayBuffer>;
  /**
   * Set form field value
   * @param doc - pdf document
   * @param page - pdf page
   * @param annotation - pdf annotation
   * @param text - text value
   */
  setFormFieldValue: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ) => PdfTask<boolean>;
  /**
   * Flatten annotations and form fields into the page contents.
   * @param doc - pdf document
   * @param page - pdf page
   * @param flag - flatten flag
   */
  flattenPage: (
    doc: PdfDocumentObject,
    page: PdfPageObject,
    flag: PdfPageFlattenFlag,
  ) => PdfTask<PdfPageFlattenResult>;
  /**
   * Extract pdf pages to a new file
   * @param doc - pdf document
   * @param pageIndexes - indexes of pdf pages
   * @returns task contains the new pdf file content
   */
  extractPages: (doc: PdfDocumentObject, pageIndexes: number[]) => PdfTask<ArrayBuffer>;
  /**
   * Extract text on specified pdf pages
   * @param doc - pdf document
   * @param pageIndexes - indexes of pdf pages
   * @returns task contains the text
   */
  extractText: (doc: PdfDocumentObject, pageIndexes: number[]) => PdfTask<string>;
  /**
   * Extract text on specified pdf pages
   * @param doc - pdf document
   * @param pageIndexes - indexes of pdf pages
   * @returns task contains the text
   */
  getTextSlices: (doc: PdfDocumentObject, slices: PageTextSlice[]) => PdfTask<string[]>;
  /**
   * Get all glyphs in the specified pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @returns task contains the glyphs
   */
  getPageGlyphs: (doc: PdfDocumentObject, page: PdfPageObject) => PdfTask<PdfGlyphObject[]>;
  /**
   * Get the geometry of the specified pdf page
   * @param doc - pdf document
   * @param page - pdf page
   * @returns task contains the geometry
   */
  getPageGeometry: (doc: PdfDocumentObject, page: PdfPageObject) => PdfTask<PdfPageGeometry>;
  /**
   * Merge multiple pdf documents
   * @param files - all the pdf files
   * @returns task contains the merged pdf file
   */
  merge: (files: PdfFile[]) => PdfTask<PdfFile>;
  /**
   * Merge specific pages from multiple PDF documents in a custom order
   * @param mergeConfigs Array of configurations specifying which pages to merge from which documents
   * @returns A PdfTask that resolves with the merged PDF file
   * @public
   */
  mergePages: (mergeConfigs: Array<{ docId: string; pageIndices: number[] }>) => PdfTask<PdfFile>;
  /**
   * Save a copy of pdf document
   * @param doc - pdf document
   * @returns task contains the new pdf file content
   */
  saveAsCopy: (doc: PdfDocumentObject) => PdfTask<ArrayBuffer>;
  /**
   * Close pdf document
   * @param doc - pdf document
   * @returns task that file is closed or not
   */
  closeDocument: (doc: PdfDocumentObject) => PdfTask<boolean>;
}

/**
 * Method name of PdfEngine interface
 *
 * @public
 */
export type PdfEngineMethodName = keyof Required<PdfEngine>;

/**
 * Arguments of PdfEngine method
 *
 * @public
 */
export type PdfEngineMethodArgs<P extends PdfEngineMethodName> = Readonly<
  Parameters<Required<PdfEngine>[P]>
>;

/**
 * Return type of PdfEngine method
 *
 * @public
 */
export type PdfEngineMethodReturnType<P extends PdfEngineMethodName> = ReturnType<
  Required<PdfEngine>[P]
>;
