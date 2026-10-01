/**
 * The public annotation protocol: the documented, stable surface for
 * application code (toolbars, sidebars, app logic). Resolve it with the token
 * exported here or from the package root. Framework-only plumbing (render
 * projection, pointer gestures, behavior registration) lives on the host lens
 * in `./host-contract`; both are the same runtime object, two typed lenses on
 * one token, so app code can't see the host methods.
 *
 * The capability has nouns for what it works on: `selection`, `draft` (a
 * polygon being drawn), `text` (typing in a text box), `tools`, `stamps`,
 * `links` and `comments`. Everything else is on the capability itself.
 */
import type {
  BatchResult,
  DeepPartial,
  EventHook,
  EventOrigin,
  OperationOptions,
  PluginErrorInfo,
  ResourceStatus,
  SettingsApi,
  Unsubscribe,
} from '@embedpdf/core';
import type {
  AnnotationProperty,
  CreationDraftAnchor,
  FieldValues,
  KindName,
  Rect,
  RotationAnchor,
  SnapSettings,
  ViewEnv,
} from '@embedpdf/core-annotation';
import type { Point } from '@embedpdf/core-geometry';
import type {
  Annotation,
  AnnotationBundle,
  AnnotationDraft,
  AnnotationImportDrop,
  AnnotationImportOptions,
  AnnotationPatch,
  AnnotationRef,
  AnnotationResourceRole,
  AnnotationResources,
  AnnotationSubtype,
  AttachmentFileSource,
  BinarySource,
  CommentThread,
  PageRef,
  PdfActionTree,
  PdfLinkTarget,
  RichTextParagraph,
} from '@embedpdf/engine-core/runtime';

import type { TextFormat } from './rich-text';
import type { AnnotationToolInput, ResolvedGhost } from './tools/definitions';

export { AnnotationToken } from './token';
export { annotationState } from './state';
export { AnnotationTransfer } from '@embedpdf/engine-core/public';
export type { Face, TextFormat, TextSelection } from './rich-text';
export type {
  Annotation,
  AnnotationBundle,
  AnnotationDraft,
  AnnotationImportDrop,
  AnnotationImportOptions,
  AnnotationPatch,
  AnnotationRef,
  AnnotationResourceRole,
  AnnotationResources,
  AnnotationSubtype,
  AttachmentContent,
  AttachmentFileSource,
  Color,
  CommentThread,
  CommentThreadReview,
  PdfLinkTarget,
  ReviewStatus,
} from '@embedpdf/engine-core/runtime';
export type {
  AnnotationFlags,
  AnnotationProperty,
  BlendMode,
  ClickCreate,
  FieldValues,
  FlagKey,
  HandleRole,
  LineEnding,
  LineEndings,
  SnapSettings,
  TextAlign,
} from '@embedpdf/core-annotation';
/** The tool `stamps.arm` activates: a sibling that must win a click while a stamp is armed keys on it. */
export { ARMED_STAMP_TOOL_ID } from './tools/definitions';

// ── settings ─────────────────────────────────────────────────────────────────

/** `'solid'` or `'dashed'` (4 pixels on, 3 off). */
export type LineStyle = 'solid' | 'dashed';

/**
 * How a selection looks: its outline, its handles and rotation handle, the
 * lines shown while snapping and turning, the box dragged to select, a text
 * box's outline while typing, and the angle while turning. Every size is in
 * screen pixels, so it looks the same at every zoom. A color left `null`
 * follows the part named in its doc, and in the end `accent`; every color,
 * width and dash can also come from a CSS variable (`--epdf-annotation-*`),
 * which wins over the setting.
 */
export interface ChromeSettings {
  /** The color of every part below that has none of its own; `null` follows the viewer's accent. */
  readonly accent: string | null;
  /** The box around the selection. */
  readonly outline: {
    /** `null` follows `accent`. */
    readonly color: string | null;
    readonly style: LineStyle;
    /** Line width, px. */
    readonly width: number;
  };
  /** The resize and point handles. */
  readonly handles: {
    readonly shape: 'square' | 'circle';
    /** What you see, px. */
    readonly size: number;
    /** What you can grab, px: keep it at 24 or more for touch. */
    readonly hitSize: number;
    readonly fill: string;
    /** `null` follows `accent`. */
    readonly stroke: string | null;
  };
  /** The round handle that turns the selection, on a short line (its stalk) above it. */
  readonly rotationHandle: {
    /** `false`: no rotation handle; the selection turns only from code. */
    readonly enabled: boolean;
    /** Its diameter, px. */
    readonly size: number;
    /** What you can grab, px. */
    readonly hitSize: number;
    /** How far it sits from the selection's edge, px. */
    readonly offset: number;
    /** `false` hides the line from the edge to it. */
    readonly stalk: boolean;
    /** `null` follows `handles.fill`. */
    readonly fill: string | null;
    /** `null` follows `handles.stroke`. */
    readonly stroke: string | null;
  };
  /** The lines shown while snapping (alignment) and while turning (rotation). */
  readonly guides: {
    /** `false`: no rotation guides while turning. */
    readonly enabled: boolean;
    /** What a move snaps to. */
    readonly color: string;
    /** The reference cross and the angle line while turning; `null` follows `accent`. */
    readonly rotationColor: string | null;
    readonly style: LineStyle;
    /** Line width of both kinds, px. */
    readonly width: number;
  };
  /** The box you drag to select several annotations. */
  readonly marquee: {
    /** `null`: `accent` at 8%. */
    readonly fill: string | null;
    /** `null` follows `accent`. */
    readonly stroke: string | null;
  };
  /** The outline of a text box while you type in it; `null` follows `accent`. */
  readonly textOutline: string | null;
  /** The angle shown next to the pointer while you turn a selection. */
  readonly readout: {
    readonly enabled: boolean;
    readonly background: string;
    readonly color: string;
  };
}

/**
 * A tool's defaults: the fields its next annotation starts with, its own over
 * the engine's. Which fields there are depends on the tool's kind; the style
 * fields most tools have are typed, the rest read as `unknown`.
 */
export interface ToolDefaults {
  readonly color?: string;
  readonly interiorColor?: string | null;
  readonly opacity?: number;
  readonly strokeWidth?: number;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontColor?: string;
  readonly textAlign?: 'left' | 'center' | 'right';
  readonly icon?: string;
  readonly contents?: string | null;
  readonly [field: string]: unknown;
}

/** What happens after a tool creates an annotation. A tool's own `afterCreate` wins over this. */
export interface AfterCreateSettings {
  /** Select the new annotation. */
  readonly select: boolean;
  /** `'stay'` keeps the tool active; `'default'` goes back to the default tool, usually `pointer`. */
  readonly tool: 'stay' | 'default';
  /** For text boxes: start typing in the new box right away. */
  readonly editText: boolean;
}

/**
 * The annotation settings: what `annotationPlugin(config)` registers over
 * {@link ANNOTATION_DEFAULTS}. `snap`, `chrome` and `afterCreate` change for
 * every open document with `updateSettings()`; `tools` is read when a
 * document opens (add a tool to an open one with `tools.register()`).
 */
export interface AnnotationSettings {
  /**
   * Change the built-in tools or add your own. An entry with a built-in's id
   * changes it (`{ id: 'ink', defaults: { strokeWidth: 6 } }`), a new id adds
   * a tool, and `extends` starts from another tool.
   */
  readonly tools: readonly AnnotationToolInput[];
  readonly afterCreate: AfterCreateSettings;
  readonly chrome: ChromeSettings;
  /** Snapping to other annotations and the page while moving, and to angles while turning. */
  readonly snap: SnapSettings;
}

/** What the annotation settings are when the app registers none. */
export const ANNOTATION_DEFAULTS: AnnotationSettings = {
  tools: [],
  afterCreate: { select: true, tool: 'stay', editText: true },
  chrome: {
    accent: null,
    outline: { color: null, style: 'solid', width: 1 },
    handles: { shape: 'square', size: 8, hitSize: 24, fill: '#ffffff', stroke: null },
    rotationHandle: {
      enabled: true,
      size: 10,
      hitSize: 24,
      offset: 32,
      stalk: true,
      fill: null,
      stroke: null,
    },
    guides: { enabled: true, color: '#e91e63', rotationColor: null, style: 'solid', width: 1.5 },
    marquee: { fill: null, stroke: null },
    textOutline: null,
    readout: { enabled: true, background: 'rgb(0 0 0 / 0.8)', color: '#ffffff' },
  },
  snap: {
    alignment: true,
    alignmentThreshold: 6,
    rotation: true,
    rotationAngles: [0, 90, 180, 270],
    rotationThreshold: 4,
  },
};

/** What `annotationPlugin(config)` takes: any of the settings, merged over the defaults. */
export type AnnotationConfig = DeepPartial<AnnotationSettings>;

// ── what the capability hands out ────────────────────────────────────────────

/**
 * The armed stamp's ghost: its image, see-through, in the box a click at the
 * pointer would place it in (page space). Every other tool's ghost paints
 * with the page's items (`source: 'ghost'`).
 */
export interface ImageGhost {
  page: PageRef;
  /** The box the stamp's placement would use, before its turn. */
  box: Rect;
  /** The tool's upright turn at this hover (degrees clockwise). */
  rot: number;
  /** How opaque it paints (0–1); `--epdf-ghost-opacity` wins over it. */
  opacity: number;
}

/**
 * One clickable link area on a page (page space): a standalone link
 * annotation, or one segment of a parent's attached link. See
 * {@link AnnotationHostCapability.listLinkItems}.
 */
export interface LinkNavItem {
  /** Stable per-page key: the annot id, `#n`-suffixed for attached segments. */
  id: string;
  /** The clickable area in page space. */
  bounds: Rect;
  target: PdfLinkTarget;
  /**
   * True for a link child riding an editable annotation (an `/RT /Group`
   * subordinate): a property of its parent while authoring, a nav behavior
   * only while reading. The nav layer stands its anchors down for attached
   * items whenever the active tool enables `annotation-edit`, so the parent
   * stays selectable/movable; standalone document links navigate regardless.
   */
  attached: boolean;
  /** The full payload-carrying `/A` tree, when one exists: the action
   *  engine's dispatch input. `target` remains its root projection. */
  activate?: PdfActionTree;
  /** The annotation ref, carried for ActionSource context. */
  ref?: AnnotationRef;
  /** Which `/AA` hover trees this link carries: the nav layer's pump flags
   *  (tree-less hover must cost zero dispatches). Links are behavior-inert
   *  to the annotation plane's hover feed while navigable, so their
   *  cursorEnter/cursorExit can only fire from the LinkLayer anchors. */
  hoverEvents?: { enter: boolean; exit: boolean };
}

/**
 * A plugin (forms, links) or an interactive renderer marks some annotations as
 * interactive: while engaged, they render their own DOM, take the pointer and
 * are not geometry-editable. Not engaged, they are edited like any other.
 */
export interface Behavior {
  id: string;
  /** Whether this behavior is about the annotation at all. */
  matches(annotation: Annotation): boolean;
  /** Whether it owns the annotation now (read live: the active tool, the app's mode). */
  engaged(annotation: Annotation): boolean;
}

/**
 * What a style panel shows: the {@link AnnotationProperty}s in display order,
 * their current `values` by key, and which differ across the selection
 * (`mixed`, shown as "mixed").
 *
 * For the selection, the properties are the ones every selected kind has (a
 * mixed selection shows the shared ones, in the first kind's order), and the
 * values the first member's; empty `properties` means nothing is selected. For
 * a tool, they are its kind's, with its defaults over the engine's. The
 * border's value is three keys (`borderStyle`, `dashArray`,
 * `cloudyIntensity`); a text's font, size, colour and alignment read as the
 * text shows (a free text's `fontColor` follows its `color` when it has none).
 */
export interface AnnotationProperties {
  readonly properties: readonly AnnotationProperty[];
  readonly values: FieldValues;
  readonly mixed: readonly string[];
}

/**
 * A free-text annotation projected for the framework: the box (page space,
 * live gesture applied) + the plain text + an `editing` flag + a ready-to-spread
 * CSS style. The framework renders one editable element from this and nothing
 * more: all the mapping (fonts, colours, alignment) is done here, once. The
 * element paints the text only: the box's fill and border are the vector
 * scene's (`listPageItems`), the same for a plain box and a callout, so the
 * live view matches the baked appearance.
 */
export interface TextItem {
  id: string;
  ref: AnnotationRef | null;
  box: Rect;
  contents: string;
  /** The rich paragraphs the editor renders and edits (run deltas over the
   *  body, which `css` carries). `contents` is their plain projection. */
  richText: { paragraphs: RichTextParagraph[] };
  editing: boolean;
  /** Applied rotation (deg, CW). `box` is the unrotated text box; the framework
   *  rotates the editable element about its centre by this. 0/undefined = none. */
  rot?: number;
  css: {
    fontFamily: string;
    /** Content units (the framework multiplies by the page scale). The line
     *  height is not here: the editor binding states the engine's line model
     *  per face on the element itself (`@embedpdf/web`, `lineModelFor`). */
    fontSize: number;
    color: string;
    /** The body's formatting (runs override it as inline spans). */
    fontWeight: number;
    fontStyle: 'normal' | 'italic';
    textDecoration: 'none' | 'underline';
    align: 'left' | 'center' | 'right';
    padding: number;
  };
}

/** What `comments.deleteThread()` did: everything went, or nothing did and `failed` says why. */
export interface ThreadDeleteResult {
  deleted: AnnotationRef[];
  failed: Array<{ ref: AnnotationRef; error: unknown }>;
}

/** The public shape of a tool: a named preset over a kind. */
export interface AnnotationTool {
  readonly id: string;
  readonly subtype: KindName;
  /** The defaults key this tool reads and writes. */
  readonly preset: string;
  readonly cursor: string;
  readonly enables: readonly string[];
  readonly defaults?: FieldValues;
  /** The tool's ghost, what a click would place following the pointer: how opaque it paints, or `false`. */
  readonly ghost: ResolvedGhost;
  /** Your own data from the tool's definition, such as a label and an icon. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** A polygon or polyline being drawn: where it is, how many points it has, and whether it can end. */
export type CreationDraft = CreationDraftAnchor;

/** A turn in progress: its page, the pointer there, and the angle so far (degrees clockwise). */
export type AnnotationRotationAnchor = RotationAnchor;

/** Where a menu attaches to the selection: its page and the box around it (page space). */
export interface AnnotationSelectionAnchor {
  readonly page: PageRef;
  readonly bounds: Rect;
  /** The rotation handle's middle, so a menu can stay clear of it; absent without one. */
  readonly rotationHandle?: Point;
}

/** Where UI attaches to one annotation: its page and the box around what it shows (page space). */
export interface AnnotationAnchor {
  readonly page: PageRef;
  readonly bounds: Rect;
  /**
   * For an annotation that keeps its size or stays upright on screen (a note):
   * the box in a given view, where `bounds` is the box at 100%. `<Anchored>`
   * calls it, so the anchor doesn't change while people zoom. Absent for
   * every other annotation.
   */
  readonly boundsIn?: (view: ViewEnv) => Rect | null;
}

// ── events ───────────────────────────────────────────────────────────────────

/** An annotation was added: the engine's record, whoever added it. */
export interface AnnotationCreatedEvent {
  readonly annotation: Annotation;
  readonly origin: EventOrigin;
}

/** An annotation was changed: the engine's record after the change. */
export interface AnnotationUpdatedEvent {
  readonly annotation: Annotation;
  readonly origin: EventOrigin;
}

/** Annotations were deleted: one, and what went with it (its popup, replies and review states). */
export interface AnnotationDeletedEvent {
  /** Everything that went, the annotation first. */
  readonly refs: readonly AnnotationRef[];
  readonly page: PageRef;
  readonly origin: EventOrigin;
}

/** The drawing order on a page changed: `refs` now sit from `toIndex` on, in this order. */
export interface AnnotationMovedEvent {
  readonly refs: readonly AnnotationRef[];
  readonly page: PageRef;
  readonly toIndex: number;
  readonly origin: EventOrigin;
}

/** Annotations were read again (a document opening, a page re-read): not a list of creates. */
export interface AnnotationResyncedEvent {
  readonly pages: readonly PageRef[] | 'all';
}

/**
 * The engine refused a change the user made (a revoked grant, a lock set
 * elsewhere). The change is already gone from the view, which shows the
 * engine's record again; this says why, so a UI can tell the user.
 */
export interface AnnotationWriteFailedEvent {
  /** The existing annotations the refused write carried; empty for a refused create. */
  readonly refs: readonly AnnotationRef[];
  readonly error: PluginErrorInfo;
}

/** The selection changed. */
export interface AnnotationSelectionChangedEvent {
  readonly refs: readonly AnnotationRef[];
  readonly previousRefs: readonly AnnotationRef[];
}

/** A polygon or polyline started, got a point, or ended. */
export interface AnnotationDraftChangedEvent {
  readonly draft: CreationDraft | null;
}

/** Typing in a text box started (`ref`) or ended (`null`). */
export interface AnnotationEditingChangedEvent {
  readonly ref: AnnotationRef | null;
}

/** The pointer moved onto an annotation (`ref`), or off it (`null`). */
export interface AnnotationHoverChangedEvent {
  readonly ref: AnnotationRef | null;
}

/** A tool's defaults changed, from your UI or your code. */
export interface ToolDefaultsChangedEvent {
  readonly toolId: string;
  /** The tool's defaults now, as `tools.getDefaults(toolId)` returns them. */
  readonly defaults: ToolDefaults;
}

/** A thread changed through this viewer. */
export interface CommentThreadChangedEvent {
  readonly rootRef: AnnotationRef;
  readonly change: 'reply' | 'text' | 'status' | 'marked' | 'deleted';
}

/** Which annotations `list()` returns: every field narrows. */
export interface AnnotationFilter {
  /** Only these pages, as refs or indexes. */
  readonly pages?: readonly (PageRef | number)[];
  readonly subtype?: AnnotationSubtype;
}

/** What `import()` did: the new annotations, where each bundle ref went, and what was left out. */
export interface AnnotationImportResult {
  /** The new annotations, in bundle order. */
  readonly annotations: readonly Annotation[];
  /** Each imported annotation's ref in the bundle, and its new ref here. */
  readonly refMap: ReadonlyArray<{ readonly from: AnnotationRef; readonly to: AnnotationRef }>;
  /** What was left out, and why, in bundle order. */
  readonly dropped: readonly AnnotationImportDrop[];
}

/** Which annotations `export()` takes. */
export interface AnnotationExportSelection {
  /** These annotations, with what they point at and their replies. */
  readonly refs?: readonly AnnotationRef[];
  /** Every annotation on these pages, as refs or indexes. */
  readonly pages?: readonly (PageRef | number)[];
}

// ── the nouns ────────────────────────────────────────────────────────────────

/** The selection: what is selected, and the verbs that change it as one. */
export interface AnnotationSelectionApi {
  /** Select these annotations; an annotation in a group brings its group. */
  set(refs: readonly AnnotationRef[]): void;
  /** Add these annotations to the selection, with their groups. */
  add(refs: readonly AnnotationRef[]): void;
  /** Select everything that can be selected, on one page or in the whole document. */
  selectAll(page?: PageRef | number): void;
  /**
   * Select everything a box on a page touches of what it paints (its lines,
   * or the inside of a filled shape), with the rest of each one's group, as
   * dragging on empty space does. Throws `not-found` for a page that isn't
   * in the document.
   */
  selectInRect(page: PageRef | number, rect: Rect): void;
  /** Clear the selection. */
  clear(): void;
  /** The selected annotations, as the user sees them. */
  list(): readonly Annotation[];
  /**
   * Change the selected annotations: each takes the fields its kind has, and
   * skips the rest. A function changes each relative to itself. While words
   * are selected in a text box being typed in, its font, size, colour and
   * formats change those words. Resolves once the engine wrote every change,
   * with what it refused in `failed`.
   */
  update(
    changes: AnnotationPatch | ((annotation: Annotation) => AnnotationPatch),
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** Link the selected annotations to a page or a website, or remove their links with `null`. */
  updateLink(
    target: PdfLinkTarget | null,
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** What a style panel shows for the selection. The same object while nothing changes. */
  getProperties(): AnnotationProperties;
  /** Delete every selected annotation. */
  delete(options?: OperationOptions): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** Turn the selection a quarter turn: `90` clockwise, `-90` the other way. */
  rotateBy(degrees: 90 | -90, options?: OperationOptions): Promise<void>;
  /** Turn the selection upright again. */
  resetRotation(options?: OperationOptions): Promise<void>;
  /** Make the selected annotations one group, saved the way Acrobat saves it. */
  group(options?: OperationOptions): Promise<void>;
  /** Split the selected groups up again. */
  ungroup(options?: OperationOptions): Promise<void>;
  /** Whether the selection can be grouped: two or more on one page, each changeable. */
  canGroup(): boolean;
  /** Whether the selection holds a group that can be split. */
  canUngroup(): boolean;
  /**
   * Where a menu attaches: the selection's page and the box around it, or
   * `null` with nothing selected, or while a gesture moves, resizes or turns it.
   */
  getAnchor(): AnnotationSelectionAnchor | null;
  /** While the selection is being turned: the pointer's point and the angle so far, or `null`. */
  getRotationAnchor(): AnnotationRotationAnchor | null;
}

/** A polygon or polyline being drawn, a click per point. */
export interface AnnotationDraftApi {
  /** The shape being drawn, or `null`. */
  get(): CreationDraft | null;
  /** End the shape and create it, as a double-click does. Resolves `null` when there was none to make. */
  finish(options?: OperationOptions): Promise<{ annotation: Annotation } | null>;
  /** Drop the shape being drawn. */
  cancel(): void;
}

/** Typing in a text box. */
export interface AnnotationTextApi {
  /** Start typing in a text box, as a double-click does. */
  begin(ref: AnnotationRef): void;
  /** Stop typing, and save what was typed. */
  end(options?: OperationOptions): Promise<void>;
  /** The text box being typed in, or `null`. */
  getEditing(): Annotation | null;
  /** Bold, italic or underline on or off: for the selected words, or the whole of each selected box. */
  toggleFormat(format: TextFormat, options?: OperationOptions): Promise<void>;
}

/** The tools: what a click or a drag creates, with which defaults. */
export interface AnnotationToolsApi {
  /** Every tool, the built-in ones and yours. */
  list(): readonly AnnotationTool[];
  /** One tool, or `null`. */
  get(id: string): AnnotationTool | null;
  /** Add a tool while the app runs, or replace the one with the same id. Returns a function that removes it. */
  register(tool: AnnotationToolInput): Unsubscribe;
  /** The fields a tool's next annotation starts with: its defaults over the engine's. The same object until they change. */
  getDefaults(id: string): ToolDefaults;
  /**
   * Change a tool's defaults for the drawings that follow: each value whole,
   * as in a patch. They stay in this viewer. Fires `onDefaultsChanged`.
   */
  updateDefaults(id: string, changes: FieldValues): void;
  /** What a style panel for the tool shows, the same shape as `selection.getProperties()`. */
  getProperties(id: string): AnnotationProperties;
  /** A tool's defaults changed. */
  readonly onDefaultsChanged: EventHook<ToolDefaultsChangedEvent>;
}

/** A stamp's bytes, to arm for a click or to place from code. */
export interface StampInput {
  /** PNG, JPEG, or one-page PDF bytes (`Blob | Uint8Array | BinaryPayload`). */
  source: BinarySource;
  /** Placed width in PDF points (height follows the picture). Default: the picture's own width. */
  targetWidth?: number;
  /** The placed annotation's `/Name`: the stamp identifier (standard or custom). */
  name?: string;
  /** The placed annotation's `/Subj`. */
  subject?: string;
  /**
   * The hover ghost's image. Either fixed bytes (PNG/JPEG) or, for vector
   * sources, which are only right at one size on screen, a
   * {@link StampPreviewProvider} the ghost asks for a render at the device
   * pixel width it shows at. Raster sources default to themselves; without
   * one a PDF source shows no ghost.
   */
  preview?: BinarySource | StampPreviewProvider;
  /**
   * The source's own size in PDF points. Raster sources are measured from
   * their header, but PDF bytes carry no size a sniff can read: a caller that
   * knows it (a stamp library does) passes it here so placement keeps the
   * picture's aspect.
   */
  intrinsicSize?: { width: number; height: number };
}

/** Where `stamps.place()` puts a stamp, without a click. */
export interface StampPlacement {
  /** The page, as a ref or an index. */
  page: PageRef | number;
  /** Where its middle goes, in page space. The size comes from the picture. */
  center: Point;
  /** Placed width in PDF points; default the picture's own (or the stamp's `targetWidth`). */
  targetWidth?: number;
  /** Its turn, degrees clockwise. Default 0. */
  rotation?: number;
  /** Select it, as placing it with a click would. Default false: code never changes the selection. */
  select?: boolean;
}

/** Stamps placed from bytes: armed for the next click, or placed from code. */
export interface AnnotationStampsApi {
  /**
   * Arm a stamp's bytes so the next click places them, as the `stamp` tool
   * does after picking a file. Rejects `invalid-input` for bytes that aren't
   * PNG, JPEG or a one-page PDF.
   */
  arm(stamp: StampInput, options?: OperationOptions): Promise<void>;
  /** Disarm the stamp. */
  disarm(): void;
  /** Whether a stamp is armed. */
  isArmed(): boolean;
  /**
   * Place a stamp's bytes with its middle on `center`, sized by its picture
   * and kept on the page, as a click would. Resolves `{ annotation }`.
   * Rejects `permission-denied` without `annotations:create`, `not-found` for
   * a page that isn't in the document, `invalid-input` for bytes that aren't
   * a picture.
   */
  place(
    stamp: StampInput,
    placement: StampPlacement,
    options?: OperationOptions,
  ): Promise<{ annotation: Annotation }>;
}

/** Links attached to annotations (a link child), or a link annotation's own target. */
export interface AnnotationLinksApi {
  /** Where an annotation links to, or `null`. */
  get(ref: AnnotationRef): PdfLinkTarget | null;
  /** Link an annotation to a page or a website. */
  set(ref: AnnotationRef, target: PdfLinkTarget, options?: OperationOptions): Promise<void>;
  /** Remove an annotation's link. */
  clear(ref: AnnotationRef, options?: OperationOptions): Promise<void>;
}

/**
 * Comments and replies: threads over the annotations. Every verb is a plain
 * annotation create, change or delete, so other people's changes, this
 * viewer's and reloads all show in `listThreads()`.
 */
export interface CommentsApi {
  /** Every thread, in reading order: by page, then from the top of the page. */
  listThreads(): readonly CommentThread[];
  /** The thread a comment is in (its first comment, a reply or a review state), or `null`. */
  getThread(ref: AnnotationRef): CommentThread | null;
  /**
   * Reply to the thread's first comment, whichever comment you pass.
   * Resolves `{ annotation }`. Rejects `permission-denied` without
   * `annotations:create`.
   */
  reply(
    ref: AnnotationRef,
    text: string,
    options?: OperationOptions,
  ): Promise<{ annotation: Annotation }>;
  /** Change a comment's text. Rejects `permission-denied` when `canSetText(ref)` is false. */
  setText(ref: AnnotationRef, text: string, options?: OperationOptions): Promise<void>;
  /** Set the user's review state on a thread, such as `'accepted'`. */
  setStatus(ref: AnnotationRef, state: string, options?: OperationOptions): Promise<void>;
  /** Check a thread off for the user, or clear the check mark. */
  setMarked(ref: AnnotationRef, marked: boolean, options?: OperationOptions): Promise<void>;
  /** Delete a comment with its replies; the first comment of a thread deletes the thread. */
  delete(ref: AnnotationRef, options?: OperationOptions): Promise<void>;
  /** Delete a whole thread, all of it or none. */
  deleteThread(ref: AnnotationRef, options?: OperationOptions): Promise<ThreadDeleteResult>;
  /** Whether the user may reply to this thread (`annotations:create`). */
  canReply(ref: AnnotationRef): boolean;
  /** Whether the user may change this comment's text (`annotations:update`, and not `lockedContents`). */
  canSetText(ref: AnnotationRef): boolean;
  /** Whether the user may set a review state on this thread (`annotations:create`). */
  canSetStatus(ref: AnnotationRef): boolean;
  /** Whether the user may check this thread off (`annotations:create`). */
  canSetMarked(ref: AnnotationRef): boolean;
  /** Whether the user may delete this comment (`annotations:delete`, and not `locked`). */
  canDelete(ref: AnnotationRef): boolean;
  /** Whether the user may delete every comment in this thread. */
  canDeleteThread(ref: AnnotationRef): boolean;
  /** A thread changed through this viewer: a reply, a text, a review state, a check mark or a delete. */
  readonly onThreadChanged: EventHook<CommentThreadChangedEvent>;
}

// ── the capability ───────────────────────────────────────────────────────────

/**
 * The annotation API: the documented, stable surface for application code.
 * Resolve it with the token re-exported from the package root
 * (`@embedpdf/plugin-annotation`). Framework-only plumbing lives on
 * {@link AnnotationHostCapability} in `@embedpdf/plugin-annotation/contract/host`.
 */
export interface AnnotationCapability extends SettingsApi<AnnotationSettings> {
  // ── reading: the engine's records, with this session's pending changes on them ──
  /**
   * The annotation as the user sees it: the engine's record with any change
   * the user made applied, as the engine will apply it. A new annotation shows
   * before the engine confirms it, under the `nm` ref it was created with.
   */
  get(ref: AnnotationRef): Annotation | null;
  /** Every annotation in drawing order, or the ones on some pages or of one kind. */
  list(filter?: AnnotationFilter): readonly Annotation[];
  /**
   * The topmost annotation at a point on a page, or `null`. A selected
   * annotation's handles count as the annotation. A page that isn't in the
   * document has none.
   */
  getAt(page: PageRef | number, point: Point): Annotation | null;
  /** Whether a change the user made to it waits for the engine. */
  isPending(ref: AnnotationRef): boolean;
  /** `loading` until the document's annotations are in, then `ready`; `forbidden` or `error` when they can't load. */
  getStatus(): ResourceStatus;
  /** The annotation under the pointer, or `null`. */
  getHovered(): Annotation | null;
  /** Read every annotation from the engine again. */
  refresh(options?: OperationOptions): Promise<void>;

  // ── creating, changing and deleting, in the engine's own terms ──
  /**
   * Create an annotation from its kind and fields: what they leave out takes
   * the `tool`'s defaults when one is named, then the engine's. Bytes travel
   * beside them (a stamp's `appearance`, a file attachment's `file`). It
   * shows at once; resolves `{ annotation }` with the engine's record.
   * `select` selects it, as drawing it would; without it, code never changes
   * the selection. A read of another annotation makes the same one again (a
   * copy): its own fields are written, and where it is comes from `page`.
   * Rejects `permission-denied` without `annotations:create`, `not-found` for
   * a page that isn't in the document or an unknown `tool`, `invalid-input`
   * for a kind the engine doesn't know or a value a write can't make (another
   * app's beveled border).
   */
  create(
    page: PageRef | number,
    draft: AnnotationDraft | Annotation,
    resources?: AnnotationResources,
    options?: OperationOptions & { tool?: string; select?: boolean },
  ): Promise<{ annotation: Annotation }>;
  /**
   * What a text tool makes of the selected text, one annotation per page: a
   * highlight, underline, strikeout or squiggly line, an insertion caret, a
   * replacement or a redaction mark. Resolves `{ annotations }` (empty
   * without a text selection). The text selection is cleared afterwards
   * unless `clear` is `false`. Rejects `permission-denied` without
   * `annotations:create`, `not-found` for a tool that makes nothing of
   * selected text.
   */
  createFromSelection(
    tool: string,
    options?: OperationOptions & { clear?: boolean },
  ): Promise<{ annotations: readonly Annotation[] }>;
  /**
   * Change the fields the patch names, as given: the engine works out what
   * follows (a free text's body from its font, a measurement's label from its
   * points, a drawn kind's shape from a new `rect`). New bytes replace what
   * they are for. It shows at once; resolves `{ annotation }` with the
   * engine's record. Rejects `not-found` for an annotation that isn't here.
   */
  update(
    ref: AnnotationRef,
    patch: AnnotationPatch,
    resources?: AnnotationResources,
    options?: OperationOptions,
  ): Promise<{ annotation: Annotation }>;
  /** Delete an annotation, with its popup and its replies. Fires `onDeleted`. */
  delete(ref: AnnotationRef, options?: OperationOptions): Promise<void>;
  /**
   * Move annotations that sit next to each other on one page to a new place
   * in its drawing order: `refs` in the order they should end in, `toIndex`
   * among the page's other annotations. Shows at once; fires `onMoved`.
   * Rejects `invalid-input` for refs on different pages.
   */
  move(refs: readonly AnnotationRef[], toIndex: number, options?: OperationOptions): Promise<void>;
  /**
   * Take annotations out as a bundle, with the bytes they carry (a stamp's
   * drawing, an attached file): every annotation, a selection of them (with
   * what they point at and their replies), or some pages'. Waits for pending
   * changes first. Rejects `permission-denied` without `doc.download`.
   */
  export(
    selection?: AnnotationExportSelection,
    options?: OperationOptions,
  ): Promise<AnnotationBundle>;
  /**
   * Put a bundle's annotations into this document, as one change: they show
   * once it's done. Resolves `{ annotations, refMap, dropped }`. Rejects
   * `permission-denied` without `annotations:create` (and, for the default
   * `attribution: 'restore'`, `doc.annotate.import`).
   */
  import(
    bundle: AnnotationBundle,
    options?: AnnotationImportOptions & OperationOptions,
  ): Promise<AnnotationImportResult>;
  /**
   * Download a stamp's drawing (`'appearance'`) or an attachment's file
   * (`'file'`): the bytes `create()` takes to make it again. Rejects
   * `permission-denied` without `doc.download`, `not-found` for an annotation
   * that isn't here, `invalid-input` for a role its kind doesn't have.
   */
  downloadResource(
    ref: AnnotationRef,
    role: AnnotationResourceRole,
    options?: OperationOptions,
  ): Promise<Uint8Array>;

  // ── the nouns ──
  readonly links: AnnotationLinksApi;
  readonly selection: AnnotationSelectionApi;
  readonly draft: AnnotationDraftApi;
  readonly text: AnnotationTextApi;
  readonly tools: AnnotationToolsApi;
  readonly stamps: AnnotationStampsApi;
  readonly comments: CommentsApi;

  // ── ports and checks ──
  /**
   * Set the function that gives the `stamp` and `attachment` tools their
   * file, `null` to make them do nothing. Returns a function that removes it.
   */
  setFilePickerProvider(provider: FilePickerProvider | null): Unsubscribe;
  /** Whether the user may see annotations (`doc.annotate.read`). */
  canRead(): boolean;
  /** Whether the user may create annotations (`annotations:create`). */
  canCreate(): boolean;
  /** Whether the user may change this annotation: its permission and its own `locked` flag. */
  canUpdate(ref: AnnotationRef): boolean;
  /** Whether the user may delete this annotation: its permission and its own `locked` flag. */
  canDelete(ref: AnnotationRef): boolean;
  /** Stop a drag, or a polygon in progress. */
  cancel(): void;

  // ── events ──
  /** An annotation was added, once the engine saved it. */
  readonly onCreated: EventHook<AnnotationCreatedEvent>;
  /** An annotation was changed, once the engine saved it. */
  readonly onUpdated: EventHook<AnnotationUpdatedEvent>;
  /** Annotations were deleted: one, plus its popup and replies. */
  readonly onDeleted: EventHook<AnnotationDeletedEvent>;
  /** The drawing order on a page changed. */
  readonly onMoved: EventHook<AnnotationMovedEvent>;
  /** Annotations were read again, as after loading a document. */
  readonly onResynced: EventHook<AnnotationResyncedEvent>;
  /** The engine refused a change the user made; the view already shows the engine's record again. */
  readonly onWriteFailed: EventHook<AnnotationWriteFailedEvent>;
  /** The selection changed. */
  readonly onSelectionChanged: EventHook<AnnotationSelectionChangedEvent>;
  /** A polygon or polyline is being drawn, or ended. */
  readonly onDraftChanged: EventHook<AnnotationDraftChangedEvent>;
  /** Typing in a text box started or ended. */
  readonly onEditingChanged: EventHook<AnnotationEditingChangedEvent>;
  /** The pointer moved onto an annotation, or off it. */
  readonly onHoverChanged: EventHook<AnnotationHoverChangedEvent>;
}

export type MarkupSubtype = 'highlight' | 'underline' | 'strikeout' | 'squiggly';

/** The armed stamp: its placement size and identity. */
export interface ArmedStampInfo {
  /** Placement size in PDF points. */
  readonly width: number;
  readonly height: number;
  readonly name?: string;
  readonly subject?: string;
}

/** The armed stamp's paintable preview, for the render layer's ghost `<img>`. */
export interface ArmedStampPreview {
  bytes: Uint8Array;
  mimeType?: string;
}

/**
 * Resolution-aware ghost preview: "give me this stamp at `devicePixelWidth`
 * pixels wide". The annotation plugin buckets the request (see
 * `previewBucket`) and caches per bucket for the arm's lifetime, so a zoom
 * gesture never renders per frame and one render serves a zoom range. A stamp
 * library renders its page lazily through its asset engine; a raster returns
 * itself (it cannot get sharper than its pixels).
 */
export type StampPreviewProvider = (devicePixelWidth: number) => Promise<ArmedStampPreview | null>;

/**
 * What the {@link FilePickerProvider} is asked for: which tool clicked (id +
 * the kind it creates), the tool's `accept` filter, and the page-space point
 * the click landed on: enough to route per tool (asset library for stamps,
 * cloud drive for attachments) or position a picker near the click. Plain
 * data: the request crosses the plugin↔adapter boundary as a message.
 */
export interface FilePromptRequest {
  toolId: string;
  /** The kind the placement creates: the routing key for per-tool pickers. */
  subtype: KindName;
  /** The tool's file-dialog filter hint (from the tool def). UX only:
   *  the engine sniffs and validates the bytes. */
  accept?: string;
  page: PageRef;
  /** The page-space point the placement is centred on. */
  point: Point;
}

/**
 * The one environment port behind every click-then-pick tool (the stamp
 * `'prompt'` source and the file-attachment tool, whose file is picked after
 * the spot): given a click, produce the file to place, `null` to cancel. The
 * plugin declares this contract but never implements it: a file dialog is a
 * DOM concern, so the framework adapter installs the implementation via
 * {@link AnnotationCapability.setFilePickerProvider}. The return shape is the
 * engine's file vocabulary: a stamp takes only `data`; an attachment embeds
 * the whole thing. A picked `File` carries its own name and type; a provider
 * returning raw bytes for an attachment must supply `name` itself.
 */
export type FilePickerProvider = (
  request: FilePromptRequest,
) => Promise<AttachmentFileSource | null>;
