/**
 * The public annotation protocol — the documented, stable surface for
 * application code (toolbars, sidebars, app logic). Resolve it with the
 * token exported here or from the package root. Framework-only plumbing
 * (render projection, pointer gestures, behavior registration) lives on the
 * host lens in `./host-contract`; both are the same runtime object, two typed
 * lenses on one token, so app code simply can't see the host methods.
 */
import type {
  BatchResult,
  ChangeOrigin,
  EventHook,
  OperationOptions,
  ResourceStatus,
  Unsubscribe,
} from '@embedpdf/core';
import type {
  AnnotationFlags,
  AnnotationProps,
  AnnotationPropsPatch,
  Callout,
  CreationDraftAnchor,
  ContentGeometry,
  Id,
  PropKey,
  PropSpec,
  Rect,
  SnapSettings,
  Subtype,
  TextQuad,
} from '@embedpdf/core-annotation';
import type { PageRotation, Point } from '@embedpdf/core-geometry';
import type {
  AnnotationDraft,
  AnnotationDTO,
  AnnotationPatch as AnnotationPatchRaw,
  AnnotationRef,
  AttachmentContent,
  AttachmentFileSource,
  BinarySource,
  CommentThread,
  PageRef,
  PdfActionTree,
  PdfLinkTarget,
  RichTextParagraph,
} from '@embedpdf/engine-core/runtime';

import type { CreateAnnotationInput } from './create-input';
import type { TextFormat } from './rich-text';
import type { AnnotationToolInput } from './tools/definitions';

export { AnnotationToken } from './token';
export type { CreateAnnotationInput, CreateAnnotationGeometry } from './create-input';
export type { Face, TextFormat, TextSelection } from './rich-text';
export type {
  AnnotationDTO,
  AnnotationDraft,
  AnnotationPatch as AnnotationPatchRaw,
  AnnotationRef,
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
  AnnotationProps,
  AnnotationPropsPatch,
  BlendMode,
  Border,
  ClickCreate,
  LineEnding,
  LineEndings,
  PropKey,
  PropSpec,
  SnapSettings,
  TextAlign,
} from '@embedpdf/core-annotation';
/** The tool `armStamp` activates — a sibling that must win a click while a payload is armed keys on it. */
export { ARMED_STAMP_TOOL_ID } from './tools/definitions';

/**
 * Selection-chrome settings: the outline, resize/vertex handles, and the rotate
 * knob. One unit story — every length is CSS px, screen-constant across zoom
 * (the plugin converts to content units per event/page via the view scale).
 * Every color falls back to `accent`, so the common case is one line:
 * `annotationPlugin({ chrome: { accent: '#e91e63' } })`. Deep-partial merged
 * over {@link DEFAULT_CHROME}; live-adjustable via
 * {@link AnnotationCapability.setChrome}.
 */
export interface ChromeSettings {
  /** The one color every chrome piece derives from unless overridden. */
  accent: string;
  outline: {
    /** One style at rest and while rotated — the box never flips style mid-gesture. */
    style: 'solid' | 'dashed';
    /** Stroke width, px. */
    width: number;
    /** Overrides `accent`. */
    color?: string;
  };
  /** Resize + vertex handles (independent of the knob — size them apart). */
  handles: {
    /** Visual square side, px. */
    size: number;
    /** Grab-zone square side, px — keep ≥ 24 for touch. */
    hitSize: number;
    fill: string;
    /** Overrides `accent`. */
    stroke?: string;
  };
  /** The rotate handle. Page-bound placement (flip/clamp) always applies. */
  knob: {
    /** Grab-dot diameter, px. */
    size: number;
    /** Grab-zone square side, px — keep ≥ 24 for touch. */
    hitSize: number;
    /** Stalk length, px — selection edge to dot centre. */
    offset: number;
    /** Draw the connector stalk. */
    stalk: boolean;
    fill: string;
    /** Overrides `accent` (dot outline + stalk). */
    stroke?: string;
  };
  /** The rotation guides shown while a rotate gesture runs: a fixed 0°/90°
   *  reference cross + a live indicator line, drawn as full-bleed chords of the
   *  page through the pivot. */
  guides: {
    /** Show the guides at all. Default true. */
    enabled: boolean;
    style: 'solid' | 'dashed';
    /** Stroke width, px. */
    width: number;
    /** The fixed reference cross. Color overrides `accent`. */
    axisColor?: string;
    axisOpacity: number;
    /** The line riding the live angle. Color overrides `accent`. */
    indicatorColor?: string;
    indicatorOpacity: number;
  };
}

/** Deep-partial patch for {@link ChromeSettings} — config + `setChrome` input. */
export interface ChromeSettingsPatch {
  accent?: string;
  outline?: Partial<ChromeSettings['outline']>;
  handles?: Partial<ChromeSettings['handles']>;
  knob?: Partial<ChromeSettings['knob']>;
  guides?: Partial<ChromeSettings['guides']>;
}

/** The armed tool's would-be placement under the cursor (content space). */
export type ToolGhost = {
  page: PageRef;
  /** The exact box the click's placement would use. */
  box: Rect;
  /** The tool's upright counter-rotation at this hover (deg, CW). */
  rot: number;
} & (
  | { kind: 'image' } // the armed stamp raster — framework blits it
  | { kind: 'vector'; toolId: string; geometry: ContentGeometry } // painted via pageItems/scene
);

/** Registration options for {@link annotationPlugin} — the initial values of the
 *  live-adjustable {@link AnnotationCapability.setSnap} /
 *  {@link AnnotationCapability.setChrome} settings. */
export interface AnnotationConfig {
  snap?: {
    /** Alignment guides while moving (snap to other annotations + the page).
     *  Default true. */
    guides?: boolean;
    /** Guide snap tolerance, content units (PDF pt). Default 5. */
    guideThreshold?: number;
    /** Snap the rotate gesture onto `rotationAngles`. Default true. */
    rotation?: boolean;
    /** Default `[0, 90, 180, 270]`. */
    rotationAngles?: number[];
    /** Rotation snap tolerance, degrees. Default 4. */
    rotationThreshold?: number;
  };
  /** Selection-chrome styling + grab geometry (all lengths CSS px). */
  chrome?: ChromeSettingsPatch;
  /**
   * Add or configure authoring tools at load. Entries merge over the built-ins by
   * id (configure one — `{ id: 'ink', defaults: { strokeWidth: 6 } }`), add a new
   * tool (a fresh id), or make a preset with `extends`
   * (`{ id: 'arrow', extends: 'line', defaults: { lineEndings: { end: 'open-arrow' } } }`).
   * See {@link AnnotationToolDef}. The runtime equivalent is
   * {@link AnnotationCapability.registerTool}.
   */
  tools?: AnnotationToolInput[];
}

/**
 * One clickable link area on a page (content space): a standalone link
 * annotation, or one segment of a parent's attached link. See
 * {@link AnnotationHostCapability.linkItemsOn}.
 */
export interface LinkNavItem {
  /** Stable per-page key: the annot id, `#n`-suffixed for attached segments. */
  id: string;
  /** The clickable area in page space. */
  bounds: Rect;
  target: PdfLinkTarget;
  /**
   * True for a link child riding an editable annotation (an `/RT /Group`
   * subordinate) — a property of its parent while authoring, a nav behavior
   * only while reading. The nav layer stands its anchors down for attached
   * items whenever the active tool enables `annotation-edit`, so the parent
   * stays selectable/movable; standalone document links navigate regardless.
   */
  attached: boolean;
  /** The full payload-carrying `/A` tree, when one exists — the action
   *  engine's dispatch input. `target` remains its root projection. */
  activate?: PdfActionTree;
  /** The annotation ref, carried for ActionSource context. */
  ref?: AnnotationRef;
  /** Which `/AA` hover trees this link carries — the nav layer's pump flags
   *  (tree-less hover must cost zero dispatches). Links are behavior-inert
   *  to the annotation plane's hover feed while navigable, so their
   *  cursorEnter/cursorExit can only fire from the LinkLayer anchors. */
  hoverEvents?: { enter: boolean; exit: boolean };
}

/** A plugin (forms, links) marks some annotations as interactive: while engaged,
 *  they render their own DOM and are not geometry-editable. Suspend → editable. */
export interface Behavior {
  id: string;
  matches(annotation: { subtype: Subtype; ref: AnnotationRef | null }): boolean;
  engaged(): boolean;
}

/**
 * The current selection's editable properties, ready to render: the ordered
 * {@link PropSpec}s every selected kind declares (a mixed selection shows the
 * shared subset, in the first kind's order), the first member's `values`, and
 * which keys differ across members (`mixed` — render an indeterminate control).
 * Empty `specs` = nothing selected / nothing editable.
 */
export interface SelectionProps {
  specs: PropSpec[];
  values: Partial<AnnotationProps>;
  mixed: PropKey[];
}

/**
 * The selection's `/F` flag state, ready for a menu/sidebar: one value per
 * flag — `true`/`false` when every selected annotation agrees, `null` when
 * they differ (render an indeterminate control). The read half of
 * {@link AnnotationCapability.updateSelectionFlags}.
 */
export type SelectionFlags = { [K in keyof AnnotationFlags]: boolean | null };

/**
 * A free-text annotation projected for the framework: the box (content space,
 * live gesture applied) + the plain text + an `editing` flag + a ready-to-spread
 * CSS style. The framework renders one editable element from this and nothing
 * more — all the mapping (fonts, colours, alignment) is done here, once. The
 * element paints the text only: the box's fill and border are the vector
 * scene's (`pageItems`), the same for a plain box and a callout, so the live
 * view matches the baked appearance.
 */
export interface TextItem {
  id: Id;
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

/**
 * Per-thread action gates, composed from two axes: authority (the
 * engine's collab-resolver mirrors — `allowsAnnotationCreate` for
 * reply/status, `allowsAnnotationMutation` against each target's
 * stamped owner for edit/delete) and PDF state (the two lock flags
 * gate different aspects, ISO 32000 Table 167: `lockedContents` blocks
 * text edits, `locked` blocks deletion). A courtesy, not the guard — the
 * engine independently enforces every write.
 */
export interface CommentPermissions {
  /** A reply is an annotation create. */
  canReply: boolean;
  /** Editing this comment's text (`contents`) — gated by `lockedContents`. */
  canEditText: boolean;
  /** Deleting this one annotation — gated by `locked`. */
  canDelete: boolean;
  /** A status change is a new hidden annotation — create authority only,
   *  never edit rights on someone else's comment. */
  canSetStatus: boolean;
  /** `canDelete` over every thread member (root, replies, grouped parts,
   *  state annotations) — the whole-thread preflight. */
  canDeleteThread: boolean;
}

export interface ThreadDeleteResult {
  deleted: AnnotationRef[];
  failed: Array<{ ref: AnnotationRef; error: unknown }>;
}

/**
 * The conversation plane's surface: a derived, memoized threads index over
 * the annotation substrate, plus the ISO-native verbs. Every verb compiles
 * down to plain annotation creates/patches/deletes — one optimistic
 * pipeline, no second write path — so remote SSE events, own edits, and
 * hydration all update `threads()` for free.
 *
 * Threads carry `pageObjectNumber` (identity is page object number, like everything
 * else); display order is a behavior of `threads()` (sorted against the
 * live layout at computation time), and display labels (`pageIndex`) are a
 * framework-hook enrichment — the layer that watches both stores.
 */
export interface CommentsApi {
  /** Every thread, display-ordered. */
  listThreads(): readonly CommentThread[];
  /** The thread containing a member (root, reply, grouped part or status). */
  getThread(ref: AnnotationRef): CommentThread | null;
  /** Reply to a thread (flat, to the root, whatever member was passed). */
  reply(ref: AnnotationRef, text: string, options?: OperationOptions): Promise<AnnotationRef>;
  /** Edit a comment's text. */
  setText(ref: AnnotationRef, text: string, options?: OperationOptions): Promise<void>;
  /** This session's review status for the thread. */
  setStatus(ref: AnnotationRef, state: string, options?: OperationOptions): Promise<void>;
  /** This session's checkmark. */
  setMarked(ref: AnnotationRef, marked: boolean, options?: OperationOptions): Promise<void>;
  /** Delete one comment. */
  delete(ref: AnnotationRef, options?: OperationOptions): Promise<void>;
  /** Delete a thread, children first. */
  deleteThread(ref: AnnotationRef, options?: OperationOptions): Promise<ThreadDeleteResult>;
  /** Per-thread action gates for this session. */
  getPermissions(ref: AnnotationRef): CommentPermissions;
  /** A thread changed through this session: reply, text, status, mark or delete. */
  readonly onThreadChanged: EventHook<CommentThreadChangedEvent>;
}

export interface CommentThreadChangedEvent {
  readonly rootRef: AnnotationRef;
  readonly change: 'reply' | 'text' | 'status' | 'marked' | 'deleted';
}

/** A confirmed creation or update: the durable record, whoever caused it. */
/**
 * The page-space record every read returns. Projected from the plugin's
 * model (which already lives in page space), so it is reference-stable per
 * annotation until that annotation changes. The PDF-space engine record is
 * `raw` (null for an optimistic entry that the engine has not confirmed yet)
 * and on the `…Raw` methods.
 */
export interface Annotation {
  readonly ref: AnnotationRef;
  readonly page: PageRef;
  readonly subtype: Subtype;
  /** Visual bounds in page space (stroke included). */
  readonly bounds: Rect;
  readonly geometry: AnnotationGeometry;
  readonly props: Partial<AnnotationProps>;
  readonly flags: AnnotationFlags;
  readonly contents: string;
  readonly author: string | null;
  readonly createdAt: string | null;
  readonly modifiedAt: string | null;
  /** The group's primary annotation, when this one is a grouped part. */
  readonly group: AnnotationRef | null;
  readonly inReplyTo: AnnotationRef | null;
  readonly authority: { readonly update: boolean; readonly delete: boolean };
  readonly raw: AnnotationDTO | null;
}

/** Subtype-specific geometry in page space (one shape per model geometry). */
export type AnnotationGeometry =
  | { readonly kind: 'rect'; readonly bounds: Rect; readonly rotation: number }
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'polygon' | 'polyline'; readonly vertices: readonly Point[] }
  | { readonly kind: 'ink'; readonly strokes: readonly (readonly Point[])[] }
  | { readonly kind: 'markup'; readonly quads: readonly TextQuad[] }
  | { readonly kind: 'caret'; readonly bounds: Rect }
  | {
      readonly kind: 'text';
      readonly bounds: Rect;
      readonly rotation: number;
      readonly callout: Callout | null;
    };

/** A page-space patch: geometry, properties, flags and text. Omitted parts are untouched. */
export interface AnnotationPatch {
  /** Move / resize a box-shaped annotation (square, circle, free text, caret, stamp). */
  readonly bounds?: Rect;
  /** Replace the geometry of a line, polygon, polyline, ink or markup. */
  readonly geometry?: AnnotationGeometryPatch;
  readonly props?: AnnotationPropsPatch;
  readonly flags?: Partial<AnnotationFlags>;
  readonly contents?: string;
  readonly richText?: { paragraphs: RichTextParagraph[] };
}

export type AnnotationGeometryPatch =
  | { readonly kind: 'rect'; readonly bounds: Rect; readonly rotation?: number }
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'polygon' | 'polyline'; readonly vertices: readonly Point[] }
  | { readonly kind: 'ink'; readonly strokes: readonly (readonly Point[])[] }
  | { readonly kind: 'markup'; readonly quads: readonly TextQuad[] }
  | {
      readonly kind: 'text';
      readonly bounds: Rect;
      readonly rotation?: number;
      readonly callout?: Callout | null;
    };

/** The public shape of an authoring tool (a named preset over a subtype). */
export interface AnnotationTool {
  readonly id: string;
  readonly subtype: Subtype;
  /** The defaults key this tool reads and writes. */
  readonly preset: string;
  readonly cursor: string;
  readonly enables: readonly string[];
  readonly defaults?: AnnotationPropsPatch;
  readonly flags?: Partial<AnnotationFlags>;
  readonly upright: boolean;
}

/** The live multi-click draft (polygon / polyline): where it is and whether it can finish. */
export type CreationDraft = CreationDraftAnchor;

/** Where selection UI attaches: the primary page, the page-space bounds, and the rotate knob. */
export interface AnnotationSelectionAnchor {
  page: PageRef;
  bounds: Rect;
  knob?: Point;
}

export interface AnnotationChangedEvent {
  readonly ref: AnnotationRef;
  readonly page: PageRef;
  readonly subtype: AnnotationDTO['subtype'];
  /** The page-space record after the change (null when it is no longer loaded). */
  readonly annotation: Annotation | null;
  /** The confirmed engine record. */
  readonly raw: AnnotationDTO;
  readonly origin: ChangeOrigin;
}

export type AnnotationCreatedEvent = AnnotationChangedEvent;

export type AnnotationUpdatedEvent = AnnotationChangedEvent;

export interface AnnotationDeletedEvent {
  readonly ref: AnnotationRef;
  readonly page: PageRef;
  readonly origin: ChangeOrigin;
}

/** Records were replaced after a stream gap or a page reload — not a fabricated history. */
export interface AnnotationResyncedEvent {
  readonly pages: readonly PageRef[] | 'all';
}

export interface AnnotationSelectionChangedEvent {
  readonly refs: readonly AnnotationRef[];
  readonly previousRefs: readonly AnnotationRef[];
}

export interface AnnotationDraftChangedEvent {
  readonly draft: CreationDraft | null;
}

export interface AnnotationEditingChangedEvent {
  readonly ref: AnnotationRef | null;
}

/** A filter for `list` / `listRaw`: every field narrows. */
export interface AnnotationFilter {
  readonly page?: PageRef;
  readonly subtype?: Subtype;
  readonly author?: string;
  /** Members of this group (its primary's ref). */
  readonly group?: AnnotationRef;
}

/**
 * The public annotation API — the documented, stable surface for application code
 * (toolbars, sidebars, app logic). Resolve it with the token re-exported from the
 * package root (`@embedpdf/plugin-annotation`).
 *
 * Framework-only plumbing (render projection, pointer gestures, behavior
 * registration) lives on {@link AnnotationHostCapability}, reachable through
 * `@embedpdf/plugin-annotation/contract/host`. Both are the same runtime
 * object — two typed lenses on one token — so app code simply can't see the host
 * methods.
 */
export interface AnnotationCapability {
  // ── reading (page space; the PDF-space engine record is on the Raw twins) ──
  get(ref: AnnotationRef): Annotation | null;
  /** Annotations in z-order — the whole document, or a page / subtype / author / group. */
  list(filter?: AnnotationFilter): readonly Annotation[];
  getRaw(ref: AnnotationRef): AnnotationDTO | null;
  listRaw(filter?: AnnotationFilter): readonly AnnotationDTO[];
  /** The topmost annotation under a page point (a selected annotation's handles count as it). */
  hitTestAt(page: PageRef, point: Point): AnnotationRef | null;
  /** Hydration: `loading` until the document's annotations are in, then `ready`. */
  getStatus(): ResourceStatus;
  /** Re-read every annotation from the engine. */
  refresh(options?: OperationOptions): Promise<void>;

  // ── creating ──
  /** Create one annotation from page-space input — the same commit path the draw tools use. */
  create(input: CreateAnnotationInput, options?: OperationOptions): Promise<AnnotationRef>;
  createMany(
    inputs: readonly CreateAnnotationInput[],
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, CreateAnnotationInput>>;
  /** The PDF-space escape hatch: an engine draft as-is. */
  createRaw(
    page: PageRef,
    draft: AnnotationDraft,
    options?: OperationOptions,
  ): Promise<AnnotationRef>;
  /**
   * Text markup, an insert-text caret, a replace-text pair or redaction marks
   * from the current text selection — one annotation per page. Requires the
   * selection plugin; resolves `[]` without a selection.
   */
  createFromSelection(
    subtype: MarkupSubtype | 'insert-text' | 'replace-text' | 'redact',
    options?: { preset?: string; clear?: boolean } & OperationOptions,
  ): Promise<readonly AnnotationRef[]>;
  /** A file attachment icon at a page point. */
  createAttachment(
    page: PageRef,
    at: Point,
    file: AttachmentFileSource,
    options?: OperationOptions,
  ): Promise<AnnotationRef>;
  /** Place stamp bytes without the pointer. */
  placeStamp(input: StampToolInput, placement: StampPlacement): Promise<AnnotationRef>;

  // ── updating ──
  /** Patch geometry, props, flags or text in page space. */
  update(ref: AnnotationRef, patch: AnnotationPatch, options?: OperationOptions): Promise<void>;
  updateMany(
    refs: readonly AnnotationRef[],
    patch: AnnotationPatch,
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** The PDF-space escape hatch: an engine patch as-is. */
  updateRaw(
    ref: AnnotationRef,
    patch: AnnotationPatchRaw,
    options?: OperationOptions,
  ): Promise<void>;
  /** Absolute rotation (degrees, clockwise) for subtypes that carry one. */
  setRotation(ref: AnnotationRef, degrees: number, options?: OperationOptions): Promise<void>;
  rotateBy(ref: AnnotationRef, delta: number, options?: OperationOptions): Promise<void>;
  /** Plain text contents; resolves once the engine confirmed the write. */
  setContents(ref: AnnotationRef, text: string, options?: OperationOptions): Promise<void>;
  setRichText(
    ref: AnnotationRef,
    document: { paragraphs: RichTextParagraph[] },
    options?: OperationOptions,
  ): Promise<void>;

  // ── deleting ──
  delete(ref: AnnotationRef, options?: OperationOptions): Promise<void>;
  deleteMany(
    refs: readonly AnnotationRef[],
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;

  // ── links (a Link child attached to an annotation) ──
  links: {
    get(ref: AnnotationRef): PdfLinkTarget | null;
    set(ref: AnnotationRef, target: PdfLinkTarget, options?: OperationOptions): Promise<void>;
    clear(ref: AnnotationRef, options?: OperationOptions): Promise<void>;
  };
  /** The embedded file of a FileAttachment. */
  readAttachment(ref: AnnotationRef, options?: OperationOptions): Promise<AttachmentContent>;

  // ── selection ──
  /** Select by ref, group-aware; `add` keeps the current selection. */
  select(refs: AnnotationRef | readonly AnnotationRef[], options?: { add?: boolean }): void;
  /** Everything selectable, or everything selectable on one page. */
  selectAll(page?: PageRef): void;
  /** Marquee selection without a pointer: everything whose bounds intersect the rect. */
  selectInRect(page: PageRef, rect: Rect, options?: { add?: boolean }): void;
  clearSelection(): void;
  getSelection(): readonly AnnotationRef[];
  listSelected(): readonly Annotation[];
  /** Editable property specs, values and mixed keys for the selection. Reference-stable. */
  getSelectionProps(): SelectionProps;
  /** The selection's `/F` flags (null for a mixed key). Reference-stable. */
  getSelectionFlags(): SelectionFlags | null;
  /** Where selection UI attaches, in page space; a view env projects the knob for a rotated view. */
  getSelectionAnchor(view?: {
    scale?: number;
    rotation?: PageRotation;
    zoom?: number;
  }): AnnotationSelectionAnchor | null;
  updateSelection(
    patch: AnnotationPropsPatch,
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  updateSelectionFlags(
    patch: Partial<AnnotationFlags>,
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  deleteSelection(options?: OperationOptions): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** Quarter-turn the selection. */
  rotateSelectionBy(delta: 90 | -90, options?: OperationOptions): Promise<void>;
  resetSelectionRotation(options?: OperationOptions): Promise<void>;
  /** Bold, italic or underline on the selection (or the edited text range). */
  toggleTextFormat(format: TextFormat, options?: OperationOptions): Promise<void>;
  group(options?: OperationOptions): Promise<void>;
  ungroup(options?: OperationOptions): Promise<void>;
  canGroup(): boolean;
  canUngroup(): boolean;

  // ── drafts and text editing ──
  /** The live multi-click draft, or null. */
  getCreationDraft(): CreationDraft | null;
  hasCreationDraft(): boolean;
  /** Commit the draft (polygon, polyline, or buffered ink strokes); null when there was none. */
  finishCreationDraft(options?: OperationOptions): Promise<AnnotationRef | null>;
  cancelCreationDraft(): void;
  beginTextEdit(ref: AnnotationRef): void;
  /** Leave editing, flushing pending text writes. */
  endTextEdit(options?: OperationOptions): Promise<void>;
  getEditingRef(): AnnotationRef | null;

  // ── stamp arming (click-to-place with an armed binary payload) ──
  armStamp(input: StampToolInput): Promise<void>;
  disarmStamp(): void;
  hasArmedStamp(): boolean;

  // ── tools and defaults ──
  listTools(): readonly AnnotationTool[];
  getTool(id: string): AnnotationTool | null;
  /** Add or replace a tool at runtime (the config equivalent is `tools`). */
  registerTool(definition: AnnotationToolInput): Unsubscribe;
  /** A tool's resolved defaults (local drawing preferences — never collaborative). */
  getToolDefaults(toolId: string): AnnotationProps;
  setToolDefaults(toolId: string, patch: AnnotationPropsPatch): void;
  /** Property specs the tool's target kind declares — the "what can I edit here". */
  listPropSpecs(toolId: string): readonly PropSpec[];

  // ── settings (live) ──
  getSnapSettings(): SnapSettings;
  updateSnapSettings(patch: Partial<SnapSettings>): void;
  getChromeSettings(): ChromeSettings;
  updateChromeSettings(patch: ChromeSettingsPatch): void;

  // ── ports and twins ──
  /** The one file picker for click-then-pick tools. Returns the remover. */
  setFilePickerProvider(provider: FilePickerProvider | null): Unsubscribe;
  /** Would this session read annotations (`doc.annotate.read`)? */
  canRead(): boolean;
  /** Would a create succeed now for this session's identity? */
  canCreate(): boolean;
  /** Per record, from the target's stamped owner (narrowed grants answer per annotation). */
  canEdit(ref: AnnotationRef): boolean;
  canDelete(ref: AnnotationRef): boolean;
  /** Cancel the in-flight gesture or draft. */
  cancel(): void;

  comments: CommentsApi;

  // ── events ──
  readonly onCreated: EventHook<AnnotationCreatedEvent>;
  readonly onUpdated: EventHook<AnnotationUpdatedEvent>;
  readonly onDeleted: EventHook<AnnotationDeletedEvent>;
  readonly onResynced: EventHook<AnnotationResyncedEvent>;
  readonly onSelectionChanged: EventHook<AnnotationSelectionChangedEvent>;
  readonly onDraftChanged: EventHook<AnnotationDraftChangedEvent>;
  readonly onEditingChanged: EventHook<AnnotationEditingChangedEvent>;
}

export type MarkupSubtype = 'highlight' | 'underline' | 'strikeout' | 'squiggly';

/** Payload for {@link AnnotationCapability.armStamp}. */
export interface StampToolInput {
  /** PNG, JPEG, or single-page PDF bytes (`Blob | Uint8Array | BinaryPayload`). */
  source: BinarySource;
  /** Placed width in PDF points (height follows the intrinsic aspect). Default 150. */
  targetWidth?: number;
  /** The placed annotation's `/Name` — the stamp identifier (standard or custom). */
  name?: string;
  /** The placed annotation's `/Subj`. */
  subject?: string;
  /**
   * The hover ghost's image. Either fixed bytes (PNG/JPEG) or — for vector
   * sources, which are only ever right at one on-screen size — a
   * {@link StampPreviewProvider} the ghost asks for a render at the device
   * pixel width it is displayed at. Raster sources default to themselves;
   * omit and the tool simply shows no ghost.
   */
  preview?: BinarySource | StampPreviewProvider;
  /**
   * The source's intrinsic size in PDF points. Raster sources are measured
   * from their own header, but PDF bytes carry no sniffable dimensions —
   * callers that know the page size (a stamp library does, from import)
   * pass it here so placement honours the true aspect instead of falling
   * back to a square.
   */
  intrinsicSize?: { width: number; height: number };
}

/** The armed stamp's paintable preview, for the render layer's ghost `<img>`. */
/** What is armed for stamp placement: its placement size and identity. */
export interface ArmedStampInfo {
  /** Placement size in PDF points. */
  readonly width: number;
  readonly height: number;
  readonly name?: string;
  readonly subject?: string;
}

export interface ArmedStampPreview {
  bytes: Uint8Array;
  mimeType?: string;
}

/**
 * Resolution-aware ghost preview: "give me this stamp at `devicePixelWidth`
 * pixels wide". The annotation plugin buckets the request (see
 * {@link previewBucket}) and caches per bucket for the arm's lifetime, so a
 * zoom gesture never renders per frame and one render serves a zoom range.
 * A stamp library renders its page lazily through its asset engine; a raster
 * returns itself (it cannot get sharper than its pixels).
 */
export type StampPreviewProvider = (devicePixelWidth: number) => Promise<ArmedStampPreview | null>;

/**
 * Where a programmatic stamp placement lands — the inputs a click supplies.
 * The box is fitted and clamped exactly as the click path does it.
 */
export interface StampPlacement {
  page: PageRef;
  /** Anchor in page points (content space): the placement is centred here. */
  at: Point;
  /** Placed width in PDF points; default the payload's intrinsic size. */
  targetWidth?: number;
  /** Content rotation, degrees clockwise. Default 0. */
  rotation?: number;
}

/**
 * What the {@link FilePickerProvider} is asked for: which tool clicked (id +
 * the kind it creates), the tool's `accept` filter, and the page-space point
 * the click landed on — enough to route per tool (asset library for stamps,
 * cloud drive for attachments) or position a picker near the click. Pure
 * data — the request crosses the plugin↔adapter boundary as a message.
 */
export interface FilePromptRequest {
  toolId: string;
  /** The kind the placement creates — the routing key for per-tool pickers. */
  subtype: Subtype;
  /** The tool's file-dialog filter hint (from the tool def). UX only —
   *  the engine sniffs/validates the bytes for real. */
  accept?: string;
  page: PageRef;
  /** The content-space point the placement is centred on. */
  point: Point;
}

/**
 * The one environment port behind every click-then-pick tool — the stamp
 * `'prompt'` source and the file-attachment tool (the file is picked after
 * the spot): given a click, produce the file to place, `null` to cancel. The
 * plugin declares this contract but never implements it — "get bytes from the
 * environment" is a DOM concern (a file dialog), so the framework adapter
 * installs the implementation via
 * {@link AnnotationCapability.setFilePickerProvider}. This keeps the plugin
 * DOM-free (Rust-portable) while the zero-config file dialog works out of the
 * box. The return shape is the engine's file vocabulary: a stamp consumes
 * only `data`; an attachment embeds the whole thing. A picked `File` carries
 * its own name and mime — a provider returning raw bytes for an attachment
 * must supply `name` itself.
 */
export type FilePickerProvider = (
  request: FilePromptRequest,
) => Promise<AttachmentFileSource | null>;
