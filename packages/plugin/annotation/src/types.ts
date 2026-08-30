import {
  createCapabilityToken,
  type DocumentEvent,
  type PageObjectNumber,
} from '@embedpdf/core';
import type { PageRotation } from '@embedpdf/core-geometry';
import type {
  AnnotationAppearanceImage,
  AnnotationDTO,
  AnnotationDraft,
  AnnotationPatch,
  AnnotationRef,
  AttachmentContent,
  AttachmentFileSource,
  BinarySource,
  CommentThread,
  PdfLinkTarget,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import type { AnnotationToolInput, ResolvedTool } from './tools';
import type {
  AnnotationFlags,
  AnnotationProps,
  AnnotationPropsPatch,
  ChromeNode,
  CreationDraftAnchor,
  Geom,
  Id,
  Model,
  PropKey,
  PropSpec,
  Rect,
  RenderItem,
  SnapSettings,
  Subtype,
  TextEndAnchor,
  TextQuad,
  Vec,
  ViewEnv,
} from '@embedpdf/core-annotation';

/**
 * Selection-chrome settings: the outline, resize/vertex handles, and the rotate
 * knob. ONE unit story — every length is CSS px, screen-constant across zoom
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
    /** ONE style at rest AND while rotated — the box never flips style mid-gesture. */
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

/**
 * Whole-document annotation hydration. The plugin always hydrates ALL
 * pages through `doc.annotations.listRawAll()` (one bulk request on
 * cloud, one worker job locally) — a comments sidebar needs every page,
 * and per-page lazy loading could never truthfully claim completeness.
 * `loading` covers the initial ingest AND a desync re-ingest; `error`
 * means live events still apply but the whole-document view is
 * incomplete until a rehydrate succeeds.
 */
export type AnnotationHydration =
  | { status: 'loading' }
  | { status: 'complete' }
  | { status: 'error'; error: unknown };

export interface AnnotationState {
  model: Model;
  hydration: AnnotationHydration;
  chrome: ChromeSettings;
  /**
   * The armed tool's FOOTPRINT ghost: where (and what) the NEXT click would
   * place — the stamp's fitted image box, or a click-create tool's default
   * geometry — computed by the same rules the placement uses (WYSIWYG). In the
   * store (not the capability closure) because it is RENDERED — vector ghosts
   * ride `pageItems`, image ghosts (stamp) render via the framework's
   * `ToolGhost`. The armed bytes stay out of the store.
   */
  toolGhost: ToolGhost | null;
  /** Bumps on every arm/disarm — the render layer's cue to rebuild (or drop)
   *  the ghost preview object URL. Never rendered itself. */
  stampArmEpoch: number;
}

/** The armed tool's would-be placement under the cursor (content space). */
export type ToolGhost = {
  pon: PageObjectNumber;
  /** The exact box the click's placement would use. */
  box: Rect;
  /** The tool's upright counter-rotation at this hover (deg, CW). */
  rot: number;
} & (
  | { kind: 'image' } // the armed stamp raster — framework blits it
  | { kind: 'vector'; toolId: string; geom: Geom } // painted via pageItems/scene
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
   * Add or configure authoring tools at load. Entries MERGE over the built-ins by
   * id (configure one — `{ id: 'ink', defaults: { strokeWidth: 6 } }`), ADD a new
   * tool (a fresh id), or make a preset with `extends`
   * (`{ id: 'arrow', extends: 'line', defaults: { lineEndings: { end: 'open-arrow' } } }`).
   * See {@link AnnotationToolDef}. The runtime equivalent is
   * {@link AnnotationCapability.registerTool}.
   */
  tools?: AnnotationToolInput[];
}
export type AnnotationAction =
  | { type: 'SET_MODEL'; model: Model }
  | { type: 'SET_HYDRATION'; hydration: AnnotationHydration }
  | { type: 'SET_CHROME'; patch: ChromeSettingsPatch }
  | { type: 'SET_TOOL_GHOST'; ghost: ToolGhost | null }
  | { type: 'STAMP_ARM_CHANGED' };

/** A plugin (forms, links) marks some annotations as interactive: while engaged,
 *  they render their own DOM and are NOT geometry-editable. Suspend → editable. */
/**
 * One clickable link area on a page (content space): a standalone link
 * annotation, or one segment of a parent's ATTACHED link. See
 * {@link AnnotationHostCapability.linkItemsOn}.
 */
export interface LinkNavItem {
  /** Stable per-page key: the annot id, `#n`-suffixed for attached segments. */
  id: string;
  rect: Rect;
  target: PdfLinkTarget;
  /**
   * True for a link CHILD riding an editable annotation (an `/RT /Group`
   * subordinate) — a PROPERTY of its parent while authoring, a nav behavior
   * only while reading. The nav layer stands its anchors down for attached
   * items whenever the active tool enables `annotation-edit`, so the parent
   * stays selectable/movable; standalone document links navigate regardless.
   */
  attached: boolean;
}

export interface Behavior {
  id: string;
  matches(a: { subtype: Subtype; ref: AnnotationRef | null }): boolean;
  engaged(): boolean;
}

/**
 * The current selection's editable properties, ready to render: the ordered
 * {@link PropSpec}s EVERY selected kind declares (a mixed selection shows the
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
 * CSS style. The framework renders ONE editable element from this and nothing
 * more — all the mapping (fonts, colours, alignment) is done here, once.
 */
export interface TextItem {
  id: Id;
  ref: AnnotationRef | null;
  box: Rect;
  contents: string;
  editing: boolean;
  /** Applied rotation (deg, CW). `box` is the UNROTATED text box; the framework
   *  rotates the editable element about its centre by this. 0/undefined = none. */
  rot?: number;
  css: {
    fontFamily: string;
    /** Content units (the framework multiplies by the page scale). */
    fontSize: number;
    lineHeight: number;
    color: string;
    align: 'left' | 'center' | 'right';
    padding: number;
    /** `/C` box background as a CSS colour, or null for transparent. */
    background: string | null;
  };
}

/**
 * The PUBLIC annotation API — the documented, stable surface for application code
 * (toolbars, sidebars, app logic). Resolve it with the token re-exported from the
 * package root (`@embedpdf/plugin-annotation`).
 *
 * Framework-only plumbing (render projection, pointer gestures, behavior
 * registration) lives on {@link AnnotationHostCapability}, reachable only through
 * the `@embedpdf/plugin-annotation/internal` entry. Both are the SAME runtime
 * object — two typed lenses on one token — so app code simply can't see the host
 * methods.
 */
/**
 * Per-thread action gates, composed from two axes: authority (the
 * engine's collab-resolver mirrors — `allowsAnnotationCreate` for
 * reply/status, `allowsAnnotationMutation` against each target's
 * stamped owner for edit/delete) and PDF state (the two lock flags
 * gate DIFFERENT aspects, ISO 32000 Table 167: `lockedContents` blocks
 * text edits, `locked` blocks deletion). A courtesy, not the guard — the
 * engine independently enforces every write.
 */
export interface CommentPermissions {
  /** A reply is an annotation CREATE. */
  canReply: boolean;
  /** Editing this comment's text (`contents`) — gated by `lockedContents`. */
  canEditText: boolean;
  /** Deleting this one annotation — gated by `locked`. */
  canDelete: boolean;
  /** A status change is a NEW hidden annotation — create authority only,
   *  never edit rights on someone else's comment. */
  canSetStatus: boolean;
  /** `canDelete` over EVERY thread member (root, replies, grouped parts,
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
 * Threads carry `pageObjectNumber` (identity is PON, like everything
 * else); DISPLAY order is a behavior of `threads()` (sorted against the
 * live layout at computation time), and display labels (`pageIndex`) are a
 * framework-hook enrichment — the layer that watches both stores.
 */
export interface CommentsApi {
  /** Every comment thread in the document, display-ordered, memoized. */
  threads(): CommentThread[];
  /** The thread containing ANY member ref (root, reply, grouped part, or
   *  state annotation), or null. */
  thread(ref: AnnotationRef): CommentThread | null;
  /** Whole-document hydration status (the sidebar's honest loading state). */
  hydration(): AnnotationHydration;
  /** Re-run whole-document hydration (desync recovery / manual refresh). */
  rehydrate(): Promise<void>;

  /** Reply to a thread. Writes FLAT (`/IRT` → the thread root, ISO reply
   *  type), whatever member was passed — presentation stays one level. */
  reply(ref: AnnotationRef, text: string): Promise<AnnotationRef>;
  /** Edit a comment's text. Appearance-inert for every kind except
   *  free-text and redaction (whose `/AP` paints `/Contents`). */
  edit(ref: AnnotationRef, text: string): Promise<void>;
  /**
   * Set this session's review status on the thread (ISO 32000 §12.5.6.3):
   * creates a hidden state annotation chained to the caller's previous
   * status when one exists, else to the root. The target annotation is
   * never modified. Known states: accepted / rejected / cancelled /
   * completed / none (custom vocabularies ride the raw create API).
   */
  setStatus(ref: AnnotationRef, state: string): Promise<void>;
  /** Toggle this session's Marked-model checkmark on the thread. */
  setMarked(ref: AnnotationRef, marked: boolean): Promise<void>;
  /** Delete exactly ONE annotation (a reply, a status, or a bare root). */
  remove(ref: AnnotationRef): Promise<void>;
  /**
   * Delete a WHOLE thread, children first. Preflighted: when any member
   * fails the delete gate the call returns every blocked ref as `failed`
   * and deletes nothing; mid-flight races surface the same way.
   */
  removeThread(ref: AnnotationRef): Promise<ThreadDeleteResult>;

  /** Truthful per-thread action gates for the ref's thread. */
  permissionsFor(ref: AnnotationRef): CommentPermissions;
}

export interface AnnotationCapability {
  // ── data API: the mutation vocabulary (engine-core types, addressable by ref) ──
  /**
   * Create an annotation on a page. `draft` is the engine-core draft for its
   * subtype (PDF-space, sRGB). Resolves to the new annotation's durable `ref`.
   * The same path the draw tools use, so programmatic and interactive creation
   * share one optimistic flow + one event stream.
   */
  create(pon: PageObjectNumber, draft: AnnotationDraft): Promise<AnnotationRef>;
  /**
   * Patch an existing annotation. `patch` is the engine-core patch for the
   * annotation's subtype — style, endings, contents, geometry are ALL just
   * fields here (there is no separate "set style"). Attribution is automatic
   * from the session identity.
   */
  update(ref: AnnotationRef, patch: AnnotationPatch): Promise<void>;
  /** Delete an annotation by ref. */
  delete(ref: AnnotationRef): Promise<void>;
  /**
   * Restyle the current selection with ONE flat property patch — the write half
   * of {@link getSelectionProps}. Each selected annotation takes the keys its
   * kind declares (`propsFor`) and ignores the rest, so a single patch restyles
   * a mixed selection. Optimistic: the model updates immediately; one engine
   * write per changed member re-syncs from the authoritative DTO.
   */
  updateSelection(patch: AnnotationPropsPatch): void;
  /**
   * Merge a `/F` flags patch into the current selection — the write half of
   * {@link getSelectionFlags}. Optimistic; one flags-only engine write per
   * changed member, which never re-bakes an appearance. Deliberately NOT
   * blocked by `locked`: this is how you unlock (Acrobat's Locked checkbox
   * stays live on a locked annotation). E.g. `{ locked: true }`,
   * `{ print: false }`, `{ hidden: true }`.
   */
  updateSelectionFlags(patch: Partial<AnnotationFlags>): void;
  /**
   * The selection's `/F` flag state: per-flag `true`/`false`, or `null` when
   * the selected annotations disagree (indeterminate). `null` overall when
   * nothing is selected. Stable reference between model changes.
   */
  getSelectionFlags(): SelectionFlags | null;

  // ── property introspection (the machine-readable "what can I edit here") ──
  /**
   * The selection's editable properties: ordered specs shared by every selected
   * kind + current values + which keys are mixed. THE way to build a property
   * sidebar/toolbar — render `specs` in order, write back via
   * {@link updateSelection}. Stable reference between model changes.
   */
  getSelectionProps(): SelectionProps;
  /** The ordered property specs a TOOL's target kind declares (callout → the
   *  free-text kind). Drives the same sidebar when nothing is selected, paired
   *  with {@link currentDefaults}/{@link setDefaults}. */
  propsForTool(toolId: string): PropSpec[];

  // ── authorization: per-record mirrors of the engine's collab resolver
  //    (`security.allowsAnnotation*`). `canCreate` asks about the caller's
  //    own identity; `canEdit`/`canDelete` about the TARGET's stamped owner,
  //    so under a narrowed grant (`annotations:update:self`) they answer
  //    per annotation. Pure authority — the `locked`/`lockedContents` flag
  //    gates live with the surfaces that touch that aspect (see
  //    `comments.permissionsFor`). The engine independently enforces. ──
  canCreate(): boolean;
  canEdit(ref: AnnotationRef): boolean;
  canDelete(ref: AnnotationRef): boolean;

  /** The conversation plane's read/write surface — see {@link CommentsApi}. */
  comments: CommentsApi;

  /**
   * The attached-link lens: an annotation's link is a `/Link` CHILD grouped
   * under it in the document (ISO-native, Acrobat-interoperable) — a
   * PROPERTY while authoring, a nav BEHAVIOR while reading. `of` derives
   * from the committed children (the one source of truth); `set`/`clear`
   * resolve when the children are committed, after which `of` reflects the
   * change. `updateSelection({ link })` remains the props-pipeline alias.
   * On the link KIND itself, `of` reads the annotation's own `/A` target
   * (retarget standalone links via `updateSelection`).
   */
  links: {
    of(ref: AnnotationRef): PdfLinkTarget | null;
    set(ref: AnnotationRef, target: PdfLinkTarget): Promise<void>;
    clear(ref: AnnotationRef): Promise<void>;
  };

  // ── reads (canonical engine DTOs) ──
  /** The annotation for a ref, or null if unknown / not yet committed. */
  get(ref: AnnotationRef): AnnotationDTO | null;
  /** Every committed annotation on a page, in z-order. */
  list(pon: PageObjectNumber): AnnotationDTO[];
  /** The selected annotations as DTOs (skips not-yet-committed drafts). */
  getSelected(): AnnotationDTO[];

  // ── selection ──
  selection(): Id[];
  /** The current selection as durable annotation refs (skips not-yet-committed drafts). */
  getSelection(): AnnotationRef[];
  /**
   * Select an annotation by ref programmatically — e.g. auto-selecting a
   * freshly placed form widget. Selecting a group member takes the whole
   * group, exactly like a click. Unknown/unselectable refs no-op. `add`
   * extends the current selection instead of replacing it.
   */
  select(ref: AnnotationRef, options?: { add?: boolean }): void;

  // ── grouping (engine `/IRT` + `/RT /Group`; selecting one member selects all) ──
  /** Group the current selection into one unit (the bottom-most member is the
   *  primary; the rest become `/RT /Group` subordinates). Page-local: no-op
   *  unless 2+ committed annotations on a single page are selected. */
  group(): Promise<void>;
  /** Ungroup the group(s) the current selection touches — every subordinate
   *  becomes top-level again. */
  ungroup(): Promise<void>;
  /** Whether {@link group} would do something for the current selection. */
  canGroup(): boolean;
  /** Whether {@link ungroup} would do something for the current selection. */
  canUngroup(): boolean;

  // ── tool defaults (LOCAL drawing preferences — never collaborative) ──
  /** Patch a tool's defaults for newly drawn annotations — the SAME flat
   *  vocabulary {@link updateSelection} writes. */
  setDefaults(subtype: Subtype, patch: AnnotationPropsPatch): void;
  /** The RESOLVED full props bag a tool will use for new annotations. */
  currentDefaults(subtype: Subtype): AnnotationProps;
  // ── snapping (alignment guides while moving + rotation snap) ──
  /** Live-adjust snapping — wire a UI toggle here (e.g.
   *  `setSnap({ guides: false })`). Initial values come from the plugin's
   *  registration config ({@link AnnotationConfig}). */
  setSnap(patch: Partial<SnapSettings>): void;
  /** The current snap settings. */
  snapSettings(): SnapSettings;
  // ── selection chrome (outline / handles / rotate knob; all lengths CSS px) ──
  /** Live-adjust the selection chrome — wire theming here (e.g.
   *  `setChrome({ accent: '#e91e63' })`). Deep-partial merge; initial values
   *  come from the plugin's registration config ({@link AnnotationConfig}). */
  setChrome(patch: ChromeSettingsPatch): void;
  /** The current (fully resolved) chrome settings. */
  chromeSettings(): ChromeSettings;
  // ── rotation (selection-scoped; rotatable kinds only) ──
  /** Rotate the current selection a quarter-turn clockwise about its centre
   *  (a single shape's own centre / the union-box centre for a group). */
  rotateSelection90(): void;
  /** Reset the current selection to its as-authored orientation (rotation → 0). */
  resetSelectionRotation(): void;
  // ── stamp tool (click-to-place with an armed binary payload) ──
  /**
   * Arm the stamp tool: `source` (PNG, JPEG, or single-page PDF bytes —
   * format sniffed, never trusted) becomes the content of the next stamp(s)
   * placed by clicking a page. The placement rect is sized from the image's
   * intrinsic aspect ratio around `targetWidth` (PDF points, default 150)
   * and centred on the click. Also activates the `'stamp'` interaction tool;
   * the payload stays armed for repeat placement until the tool changes or
   * {@link disarmStamp} is called. Resolves once the payload is validated.
   */
  armStamp(input: StampToolInput): Promise<void>;
  /** Drop the armed stamp payload (a tool change away from 'stamp' does this too). */
  disarmStamp(): void;
  /**
   * Install the ONE file-picker port every click-then-pick tool resolves
   * through (see {@link FilePickerProvider}) — the stamp `'prompt'` source and
   * the file-attachment tool today. The framework adapter installs a
   * file-dialog provider by default; pass your own (asset library, cloud
   * drive — switch on `req.subtype` / `req.toolId`), or `null` to make
   * click-then-pick tools inert. One slot; last write wins.
   */
  setFilePickerProvider(provider: FilePickerProvider | null): void;
  /**
   * Decode and return the file embedded in a FileAttachment annotation —
   * bytes plus the name/mime needed to hand it to the user. Listings carry
   * only metadata (`FileAttachmentAnnotationDTO.file`); this is the explicit
   * bytes-out call. Throws when the engine transport has not shipped
   * attachment download (feature-detected).
   */
  downloadAttachment(ref: AnnotationRef): Promise<AttachmentContent>;

  // ── tools (add/configure at runtime; the config equivalent is `tools`) ──
  /**
   * Register (or replace, by id) an authoring tool at runtime — the imperative
   * mirror of the `tools` config. Same {@link AnnotationToolDef} vocabulary
   * (`extends`, per-tool `defaults`, …). Returns an unregister fn.
   */
  registerTool(def: AnnotationToolInput): () => void;

  // ── text-selection authoring (one-shot; requires the selection plugin) ──
  /**
   * Turn the CURRENT text selection into markup annotations — one per
   * selected page, from the selection's oriented per-line quads — then clear
   * the selection. The one-call form of what the markup tools do on
   * commit, made for selection-menu buttons ("Highlight") and automation.
   * `preset` is a tool id whose defaults style the markup (e.g.
   * `'highlight'`); defaults to the subtype's own. Returns false (and does
   * nothing) when no selection plugin is installed or nothing is selected.
   */
  markupFromSelection(subtype: Subtype, preset?: string): boolean;

  // ── multi-click creation drafts (polygon, polyline, …) ──
  /** Commit the in-progress multi-click creation draft (no-op when there is
   *  none, or it can't finish yet — see `creationDraftAnchor().canFinish`). */
  finishCreationDraft(): void;
  /** Discard the in-progress multi-click creation draft. */
  cancelCreationDraft(): void;

  // ── lifecycle ──
  deleteSelection(): void;
  deselect(): void;
  cancel(): void;
}

/** Payload for {@link AnnotationCapability.armStamp}. */
export interface StampToolInput {
  /** PNG, JPEG, or single-page PDF bytes (`Blob | Uint8Array | BinaryPayload`). */
  source: BinarySource;
  /** Placed width in PDF points (height follows the intrinsic aspect). Default 150. */
  targetWidth?: number;
  /**
   * A browser-paintable render of `source` for the hover ghost (PNG/JPEG).
   * Required for the ghost when `source` is PDF bytes — the browser cannot
   * paint those; the caller (e.g. a stamp library) supplies its cached page
   * render. Raster sources default to the source itself; omit everywhere
   * else and the tool simply shows no ghost.
   */
  preview?: BinarySource;
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
export interface ArmedStampPreview {
  bytes: Uint8Array;
  mimeType?: string;
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
  pon: PageObjectNumber;
  /** The content-space point the placement is centred on. */
  point: Vec;
}

/**
 * The ONE environment port behind every click-then-pick tool — the stamp
 * `'prompt'` source and the file-attachment tool (the file is picked AFTER
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
export type FilePickerProvider = (req: FilePromptRequest) => Promise<AttachmentFileSource | null>;

/**
 * The HOST (framework) surface: everything the render layer, the interaction hub,
 * and sibling plugins need, on top of the public {@link AnnotationCapability}.
 * Internal — import the token from `@embedpdf/plugin-annotation/internal`, never
 * from application code.
 */
export interface AnnotationHostCapability extends AnnotationCapability {
  // ── render projection (consumed by the framework render layer) ──
  /** `view` (the page's scale + total display rotation, from its transform)
   *  projects screen-anchored (`noZoom`/`noRotate`) bodies to their effective
   *  footprint. Pass it from the page context; absent → stored geometry. */
  pageItems(pon: PageObjectNumber, view?: ViewEnv): RenderItem[];
  /** `scale` (view px per content unit, from the page's transform) converts the
   *  px chrome settings into content units — pass it so the knob stalk and grab
   *  zones are screen-constant. `rotation` (the page's total display rotation)
   *  and `zoom` (the page's zoom RELATIVE to its 100% baseline —
   *  `transform.zoom`, NOT `viewScale`) complete the view env for
   *  screen-anchored bodies. Absent scale → settings are read as content
   *  units. */
  chrome(
    pon: PageObjectNumber,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): ChromeNode[];
  /** The anchor for a selection-aware floating menu: the primary page + the
   *  selection's union box on that page (content space), or null when nothing
   *  selectable is selected. One anchor regardless of cross-page selection.
   *  `scale`/`rotation`/`zoom` as in {@link chrome} (the anchor page's view). */
  selectionAnchor(
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): { pon: PageObjectNumber; bounds: Rect; knob?: Vec } | null;
  /** The anchor + action state for a live multi-click creation draft, or null. */
  creationDraftAnchor(): CreationDraftAnchor | null;
  /** Cache key for a page's baked appearances: the COMMITTED id + AP box of every
   *  baked annotation (gesture previews excluded). Changes exactly once per
   *  committed create/geometry-edit, so the render layer refetches rasters then —
   *  and only then (a stamp resize re-fits its AP engine-side, for example). */
  appearanceEpoch(pon: PageObjectNumber): string;
  /**
   * The scale a baked appearance should render at for a desired device
   * scale — `snapAppearanceScale` over the document's `renderPolicy` (the
   * kernel-materialized fact; identity under `continuous`). THE identity a
   * render layer keys its bake effect on: inside an appearance-lattice rung,
   * zoom ticks produce the same value → no re-bake; crossing a rung re-bakes
   * once. This plugin owns its raster product end to end — the policy is a
   * document fact, not another plugin's possession.
   */
  bakeScale(renderScale: number): number;
  /** The engine's rendered /AP appearance images for a page — the `baked` visual. */
  appearances(
    pon: PageObjectNumber,
    scale: number,
    signal?: AbortSignal,
  ): Promise<AnnotationAppearanceImage[]>;
  /** Convert an engine appearance rect (PDF user space) to a content-space box, so
   *  the renderer places the baked bitmap by its OWN `/Rect` without touching the
   *  PDF↔content seam. Null if the page's crop box is unknown. */
  toContentBox(pon: PageObjectNumber, rect: PdfRect): Rect | null;
  /** No-op since whole-document hydration: the model is seeded by
   *  `listRawAll()` at document open. Kept as API for layers that call it
   *  on page mount. */
  ensurePage(pon: PageObjectNumber): void;
  /**
   * Drop and RE-READ one page's annotations from the engine — the hook for
   * cross-plane mutations (e.g. `doc.forms.createField`/`deleteField`
   * changing the page's widget population underneath this plugin). Resolves
   * when the fresh page is in the model, so a caller can select what it just
   * created.
   */
  reloadPage(pon: PageObjectNumber): Promise<void>;
  // ── whole-document hydration (see the controller in capability.ts) ──
  /** Live hydration status — `loading` covers initial ingest AND a desync
   *  re-ingest. */
  hydration(): AnnotationHydration;
  /** Kick hydration exactly once per document; the effects layer calls
   *  this at registration. Subsequent calls no-op. */
  ensureHydrated(): void;
  /** Re-run whole-document hydration (desync recovery). Safe to call while
   *  one is in flight — the fresh run is chained after it. */
  rehydrate(): Promise<void>;
  /**
   * The effects layer hands every REMOTE `annotation.*` event here: during
   * a hydration window it queues (replayed by audit cursor after ingest —
   * the delete-resurrection guard); otherwise it applies immediately.
   */
  deliverRemoteAnnotationEvent(event: DocumentEvent): void;
  // ── free-text (the editable-element layer) ──
  /** The free-text boxes on a page, ready to render as editable elements.
   *  `view` as in {@link pageItems}. */
  textItems(pon: PageObjectNumber, view?: ViewEnv): TextItem[];
  /** The id of the annotation currently being text-edited, or null. Read live (not
   *  from a stale render) so the editor can tell a real exit from a focus-steal. */
  currentEditing(): Id | null;
  /** Enter text-edit on a free-text annotation (focus its editable element). */
  beginTextEdit(ref: AnnotationRef): void;
  /** Enter text-edit on whatever free-text box is under a content point — wired
   *  to a double-click / long-press by the interaction edit handler. Returns
   *  whether an editable free-text was actually found and opened; false lets
   *  the caller fall through to a normal press (so a long-press on a highlight
   *  selects it instead of being swallowed by a no-op edit attempt). */
  beginTextEditAt(
    pon: PageObjectNumber,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): boolean;
  /** Apply the editor's plain text — optimistic locally, debounced to the engine. */
  setContents(ref: AnnotationRef, text: string): void;
  /** Leave text-edit (flush any pending write). */
  endTextEdit(): void;
  // ── hit-testing & cursor (consumed by the interaction edit handler) ──
  /** What's under a content point — for the edit handler's capture decision.
   *  `scale` (the page's view px per content unit) keeps grab zones
   *  screen-constant; `rotation` + `zoom` (relative, `transform.zoom`)
   *  complete the view env for screen-anchored bodies. Pass all three from
   *  the pointer sample. */
  hitKind(
    pon: PageObjectNumber,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
    /** Widen grab zones to finger-sized targets (pass `pointerType === 'touch'`). */
    touch?: boolean,
  ): 'handle' | 'rotate' | 'group-handle' | 'annot' | 'empty';
  /**
   * TOUCH CONSENT (the interaction hub's `claimsTouch` predicate): should a
   * finger landing here own a TOOL gesture instead of navigating? True over
   * the selection's chrome (resize handles, rotate knob, group box) and over
   * the body of an already-SELECTED, transformable annotation — never over an
   * unselected one, so annotation-dense pages still scroll; tap-select first
   * is the platform convention (Apple Markup). Uses finger-sized grab zones.
   * Pure read.
   */
  claimsTouchAt(
    pon: PageObjectNumber,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): boolean;
  /** The cursor to show at a content point (resize over a handle, move/pointer over a body, else null). */
  cursorAt(
    pon: PageObjectNumber,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): string | null;
  /**
   * Report the pointer's position for hover state (`null` = off every page).
   * Diffs the topmost hit against the model and dispatches only on CHANGE
   * (enter/leave cadence) — drives scene-level hover affordances like the
   * redaction mark's applied-look preview. Called from the edit handler's
   * onHover, which already samples every move for cursor claims.
   */
  hoverAt(
    at: {
      pon: PageObjectNumber;
      point: Vec;
      scale?: number;
      rotation?: PageRotation;
      zoom?: number;
    } | null,
  ): void;
  behaviorFor(a: { subtype: Subtype; ref: AnnotationRef | null }): Behavior | null;
  /**
   * The clickable link areas of a page (content space): standalone link
   * annotations plus every ATTACHED-link segment (folded children — their
   * rects derived by the SAME rule the reconciler writes, so the clickable
   * area and the written `/Rect`s can't disagree). Hidden annotations are
   * excluded. THE data feed for the navigation plane (plugin-link);
   * memoized by model identity for selector use.
   */
  linkItemsOn(pon: PageObjectNumber): LinkNavItem[];
  /** Drop selected annotations whose Behavior is currently ENGAGED — inert
   *  things cannot stay selected. Call after anything that flips engagement
   *  (the plugin wires it to tool changes). */
  pruneEngagedSelection(): void;
  // ── interaction intents (run the pure core + perform engine effects) ──
  editPointer(
    phase: 'down' | 'move' | 'up',
    pon: PageObjectNumber,
    point: Vec,
    shift: boolean,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
    /** Finger-sized grab zones for the gesture's own hit resolution — pass the
     *  sample's `pointerType === 'touch'` so the gesture grabs exactly what
     *  {@link claimsTouchAt} claimed. */
    touch?: boolean,
  ): void;
  marqueePointer(
    phase: 'down' | 'move' | 'up',
    pon: PageObjectNumber,
    point: Vec,
    shift: boolean,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): void;
  /** Run the draw gesture for an authoring TOOL (by id). The plugin resolves it
   *  to a routing subtype + defaults preset; a bare subtype also works (headless).
   *  `displayRotation` (the DOWN sample's page rotation: /Rotate + view rotation)
   *  feeds the tool's `upright` policy — omit it and upright is a no-op. */
  createPointer(
    tool: string,
    phase: 'down' | 'move' | 'up',
    pon: PageObjectNumber,
    point: Vec,
    finish?: boolean,
    displayRotation?: PageRotation,
  ): void;
  /** Commit the strokes currently buffered by an ink tool's grouping window. */
  finishInkDraft(): void;
  /** Create one text-markup annotation on a page from the selected text's
   *  per-line oriented quads (content space) — the `text-selection` create
   *  gesture. Axis-aligned callers build quads with `textQuadFromRect`. */
  createMarkup(subtype: Subtype, pon: PageObjectNumber, quads: TextQuad[], preset?: string): void;
  /** Create a caret annotation at a text-selection end anchor. */
  createCaret(pon: PageObjectNumber, anchor: TextEndAnchor): void;
  /** Create one Adobe-compatible Caret + StrikeOut replace-text group. */
  createReplaceText(
    pon: PageObjectNumber,
    quads: TextQuad[],
    anchor: TextEndAnchor,
    preset?: string,
  ): void;
  /** Set the live markup preview from the selection's per-page quads (renders a
   *  ghost that looks like the markup it will become). */
  previewMarkup(subtype: Subtype, quadsByPage: Record<number, TextQuad[]>, preset?: string): void;
  clearMarkupPreview(): void;
  // ── stamp placement (consumed by the interaction stamp handler) ──
  /** Place the armed stamp centred on a content point. Returns false (no
   *  capture) when nothing is armed. `displayRotation` (the click sample's page
   *  rotation) feeds the active tool's `upright` policy. */
  placeArmedStamp(pon: PageObjectNumber, point: Vec, displayRotation?: PageRotation): boolean;
  /**
   * The one click-to-place entry for every payload-carrying tool (stamp /
   * note / file attachment) — the place handler forwards each down here.
   * Armed payload first, then the active tool's kind routes; returns whether
   * the click was consumed.
   */
  placeAt(pon: PageObjectNumber, point: Vec, displayRotation?: PageRotation): boolean;
  /** Whether a stamp payload is armed — the hover handler's cheap pre-check. */
  hasArmedStamp(): boolean;
  /**
   * Update the armed tool's FOOTPRINT ghost to a content point — the stamp's
   * fitted image box (same fit + clamp as placement), or a click-create tool's
   * default geometry (same anchor + clamp as the click commit). The ghost IS
   * the placement, never an approximation. Tools without a determinable
   * footprint (or with a `false` ghost policy) clear instead.
   */
  ghostHoverAt(
    toolId: string,
    pon: PageObjectNumber,
    point: Vec,
    displayRotation?: PageRotation,
  ): void;
  /** Drop the hover ghost (pointer left the pages / a gesture started). */
  clearGhost(): void;
  /**
   * Drive the transient placement preview during an EXTERNALLY-owned creation
   * gesture (the form plugin's drag-to-place): the box the commit would use,
   * page-clamped, styled from the TOOL's defaults, painted through the same
   * ghost pipeline as every footprint. Sibling plugins call THIS — never the
   * annotation store directly.
   */
  setPlacementPreview(toolId: string, pon: PageObjectNumber, box: Rect): void;
  /** Drop the placement preview (gesture ended — commit, cancel, or error). */
  clearPlacementPreview(): void;
  // ── ghost projection (consumed by the framework render layer) ──
  /** The armed tool's footprint ghost on a page (content space), or null.
   *  Vector ghosts also ride {@link pageItems}; only `kind: 'image'` ghosts
   *  need the framework's blit. */
  toolGhost(pon: PageObjectNumber): ToolGhost | null;
  /** The armed stamp's paintable preview bytes, or null (no ghost to show). */
  armedStampPreview(): ArmedStampPreview | null;
  /** Bumps on arm/disarm — keys the render layer's preview object-URL lifetime. */
  stampArmEpoch(): number;
  /**
   * Resolve the ACTIVE tool's {@link StampSourceSpec} for a click and place a
   * stamp centred on `point`: fixed `bytes` land immediately; a `'prompt'` source
   * asks the installed {@link FilePickerProvider} (placement is dropped if it
   * cancels, or if the tool/document changed while it was open). Returns false
   * (no capture) when the active tool has no source. The click-then-pick
   * counterpart of {@link placeArmedStamp}. `displayRotation` as on
   * {@link placeArmedStamp}.
   */
  requestStampAt(pon: PageObjectNumber, point: Vec, displayRotation?: PageRotation): boolean;
  // ── tool registry (consumed by the plugin init + interaction handlers) ──
  /** Every resolved tool (built-ins + config `tools`), for the registration loop. */
  tools(): ResolvedTool[];
  /** One resolved tool by id, or null when it is not registered. */
  tool(id: string): ResolvedTool | null;
  /** A tool's routing subtype (arrow → `line`) — how the draw handler picks the
   *  gesture and the created annotation's PDF kind. Falls back to the id. */
  toolSubtype(id: string): Subtype;
  // ── extension point for sibling plugins (forms, links) ──
  registerBehavior(b: Behavior): () => void;
}

/**
 * The annotation capability token. Typed to the full {@link AnnotationHostCapability}
 * here (the package internals + the `/internal` entry use this view). The package
 * root re-exports the SAME token narrowed to {@link AnnotationCapability}.
 */
export const AnnotationToken = createCapabilityToken<AnnotationHostCapability>('annotation', {
  hint: `add annotationPlugin() from '@embedpdf/plugin-annotation' to your plugins list`,
});
