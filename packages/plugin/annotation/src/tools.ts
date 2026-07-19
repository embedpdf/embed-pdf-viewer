/**
 * The annotation TOOL registry — the one place that says which tools exist and
 * what each one authors. A tool is a named authoring PRESET, not a new kind: it
 * binds an `id` to a PDF `subtype`, a bag of per-tool `defaults`, a cursor, and
 * the interaction TAGS it turns on. Two tools can share a subtype but differ in
 * defaults (an "arrow" is a `line` with an arrowhead default), which is exactly
 * why defaults are keyed by the tool id (the `preset`), never by the subtype.
 *
 * The built-in {@link DEFAULT_TOOLS} reproduce v2's tool set; an embedder tweaks
 * or extends them with `annotationPlugin({ tools: [...] })`. Same-id entries MERGE
 * over the built-in (configure it); a new id ADDS a tool; `extends` inherits an
 * existing tool's subtype/cursor/tags so a preset is one line.
 */
import type {
  AnnotationFlags,
  AnnotationPropsPatch,
  ClickCreate,
  InkStraightenOptions,
  PropKey,
  Subtype,
} from '@embedpdf/core-annotation';
import type { BinarySource, InkIntent } from '@embedpdf/engine-core/runtime';

/**
 * How a stamp-family tool resolves the image bytes it places — pure DATA, so a
 * tool table stays JSON-serializable (config can come from a file, a DB, or the
 * server). Evaluated at CLICK time, so the user picks the spot first, then the
 * source:
 *   - `{ kind: 'bytes' }` — fixed bytes: a company rubber-stamp.
 *   - `{ kind: 'prompt' }` — ask the environment for bytes. The plugin does NOT
 *     know how (a file dialog is DOM); the file-picker port (`FilePickerProvider`),
 *     installed by the framework adapter, fulfils it. Resolve `null` there to cancel.
 */
export type StampSourceSpec = { kind: 'bytes'; source: BinarySource } | PromptSourceSpec;

/**
 * The ask-the-environment resolution, shared by every click-then-pick tool
 * (a stamp's `'prompt'` source, the file-attachment tool). `accept` is the
 * file-dialog filter the picker request carries — a UX hint only, the engine
 * sniffs/validates the bytes for real. Unset = any file.
 */
export interface PromptSourceSpec {
  kind: 'prompt';
  accept?: string;
}

/** Declarative result of committing a text selection while a tool is active. */
export type SelectionAuthoring =
  | { kind: 'markup' }
  | { kind: 'text-edit'; operation: 'insert' | 'replace' };

/**
 * The armed tool's IN-PAGE preview:
 *   - `footprint` — the EXACT box a click would place, in the page (content
 *     space, page-clamped, WYSIWYG). Meaningful only when the box is
 *     determinable: an armed stamp payload, or a `clickCreate` size.
 *   - `false` — no preview.
 * WHICH tool is armed is the CURSOR's job, not a ghost's: give the tool an
 * image cursor built from your toolbar icon (the hub's `setToolCursor` + the
 * web package's `svgCursor`), and the hub's claim/gap arbitration keeps it
 * honest over annotations, form fields, and page gaps.
 */
export type GhostPolicy = false | { mode: 'footprint' };

/** Time/geometry policy for freehand ink authoring. */
export interface InkAuthoringOptions {
  /** Group strokes made within this interval into one `/InkList`; 0 commits immediately. */
  groupStrokesMs?: number;
  /** Optional pure straight-line recognition applied to each completed stroke. */
  straighten?: InkStraightenOptions;
}

/**
 * The creation properties each known authoring kind actually consumes. This is
 * deliberately separate from the flat internal patch vocabulary: it gives tool
 * configuration precise compile-time and runtime validation while mixed-selection
 * edits can keep using `AnnotationPropsPatch`.
 */
export const TOOL_DEFAULT_KEYS = {
  square: ['color', 'interiorColor', 'opacity', 'strokeWidth', 'border'],
  circle: ['color', 'interiorColor', 'opacity', 'strokeWidth', 'border'],
  line: ['color', 'interiorColor', 'opacity', 'strokeWidth', 'border', 'lineEndings'],
  polygon: ['color', 'interiorColor', 'opacity', 'strokeWidth', 'border'],
  polyline: ['color', 'interiorColor', 'opacity', 'strokeWidth', 'border', 'lineEndings'],
  ink: ['color', 'opacity', 'strokeWidth', 'blendMode'],
  'free-text': [
    'fontFamily',
    'fontSize',
    'fontColor',
    'textAlign',
    'opacity',
    'interiorColor',
    'color',
    'strokeWidth',
    'border',
  ],
  'free-text-callout': [
    'fontFamily',
    'fontSize',
    'fontColor',
    'textAlign',
    'opacity',
    'interiorColor',
    'color',
    'strokeWidth',
    'border',
    'lineEndings',
  ],
  highlight: ['color', 'opacity', 'blendMode'],
  underline: ['color', 'opacity', 'blendMode'],
  strikeout: ['color', 'opacity', 'blendMode'],
  squiggly: ['color', 'opacity', 'blendMode'],
  caret: ['color', 'opacity'],
  redact: ['color', 'interiorColor', 'opacity', 'fontFamily', 'fontSize', 'fontColor', 'textAlign'],
  stamp: [],
  // A link preset may carry a FIXED target ('docs-link' style one-click links).
  link: ['link'],
  text: ['icon', 'color', 'opacity'],
  'file-attachment': ['icon', 'color', 'opacity'],
  // Widget CLIENT kinds (the form plugin's palette tools): the same key sets
  // the kind table declares — box styling for every family, /DA text styling
  // for the text-bearing ones. The engine maps them onto /MK //BS //DA //Q.
  'widget-text': [
    'color',
    'interiorColor',
    'strokeWidth',
    'border',
    'fontFamily',
    'fontSize',
    'fontColor',
    'textAlign',
  ],
  'widget-choice': [
    'color',
    'interiorColor',
    'strokeWidth',
    'border',
    'fontFamily',
    'fontSize',
    'fontColor',
    'textAlign',
  ],
  'widget-toggle': ['color', 'interiorColor', 'strokeWidth', 'border'],
} as const satisfies Record<string, readonly PropKey[]>;

export type ToolAuthoringKind = keyof typeof TOOL_DEFAULT_KEYS;
type ToolDefaultKey<K extends ToolAuthoringKind> = (typeof TOOL_DEFAULT_KEYS)[K][number];
export type ToolDefaultsFor<K extends ToolAuthoringKind> = [ToolDefaultKey<K>] extends [never]
  ? never
  : Pick<AnnotationPropsPatch, ToolDefaultKey<K>>;

/**
 * A tool definition — the public config vocabulary. Every field except `id` is
 * optional: the common cases are "configure a built-in" (`{ id, defaults }`) and
 * "add a preset" (`{ id, extends, defaults }`).
 */
export interface AnnotationToolDef<K extends ToolAuthoringKind = ToolAuthoringKind> {
  /** Stable tool id — the value passed to `activateTool` and the `defaults` key. */
  id: string;
  /** Inherit `subtype` / `propsKind` / `cursor` / `enables` / `source` /
   *  `selection` / `intent` / `ink` / `meta`
   *  from an existing tool id (a built-in or another entry). Own fields win. */
  extends?: string;
  /** The ROUTING KIND this tool authors — the core's client kind (the geometry
   *  it draws + the props key). Usually the PDF subtype, but not always:
   *  `free-text-callout` routes the callout gesture onto a free-text
   *  annotation, and `widget-text`/`widget-choice`/`widget-toggle` are client
   *  views of the ONE PDF `widget` subtype (a form tool's commit goes through
   *  `doc.forms`, never this plugin — see the form plugin's tool table).
   *  Defaults to the inherited kind, or the id when neither is given. */
  subtype?: Subtype;
  /** The kind whose editable-property specs a style panel shows for this tool.
   *  Defaults to `subtype` (a callout authors `free-text` props, for example). */
  propsKind?: string;
  /** ADVANCED: the `defaults` key this tool reads/writes. Defaults to the id, and
   *  that is almost always right — override it only to alias a shared defaults bag
   *  (the built-in insert-caret tool points its preset at the `caret` key). */
  preset?: string;
  /** Seed defaults for newly drawn annotations — the flat AnnotationProps patch,
   *  merged over any inherited defaults (line endings merge per side). */
  defaults?: ToolDefaultsFor<K>;
  /**
   * `/F` annotation flags seeded on everything this tool creates, merged over
   * the drawn default (`print` set — Acrobat parity) and any inherited seed.
   * A note tool passes `{ noZoom: true, noRotate: true }` so its icons stay
   * screen-sized and upright (the spec's rule for Text annotations).
   */
  flags?: Partial<AnnotationFlags>;
  /** The pointer cursor while this tool is active. Defaults inherited / `crosshair`. */
  cursor?: string;
  /** Interaction capability tags this tool enables (which handlers wake up). */
  enables?: string[];
  /**
   * How the click-to-place payload resolves. Stamps take the full spec
   * ({@link StampSourceSpec}: fixed bytes or prompt); file attachments are
   * prompt-only ({@link PromptSourceSpec} — the file always comes from the
   * environment). Other kinds carry no payload.
   */
  source?: K extends 'stamp'
    ? StampSourceSpec
    : K extends 'file-attachment'
      ? PromptSourceSpec
      : never;
  /** What a committed text selection authors. Omit for pointer/click tools. */
  selection?: SelectionAuthoring;
  /** PDF `/IT` authored by an intent-bearing ink preset. */
  intent?: K extends 'ink' ? InkIntent : never;
  /** Ink-only stroke grouping and straightening policy. */
  ink?: K extends 'ink' ? InkAuthoringOptions : never;
  /**
   * Place annotations UPRIGHT: counter-rotate what this tool creates against the
   * page's TOTAL display rotation (document /Rotate + any stage view rotation),
   * so it reads horizontally exactly as the author saw it — Adobe's behaviour
   * for stamps and text on rotated pages. WYSIWYG at authoring time: the
   * rotation is baked into the annotation, so a save keeps what the author saw
   * (other viewers apply only /Rotate — document that when view rotation is in
   * play). Box kinds only (stamp / free-text, where reading orientation is
   * meaningful); ignored by vertex kinds and callouts. Default: on for the
   * built-in `stamp` and `free-text` tools, off elsewhere.
   */
  upright?: boolean;
  /**
   * What a bare CLICK creates (v2's `clickBehavior`): a default-size shape
   * centred on the point / a default-length line from it / free-text's
   * type-here box — page-clamped, in PDF pt. `false` = drag-only. Defaults:
   * on for the built-in square/circle/line/free-text, off elsewhere.
   */
  clickCreate?: ClickCreate | false;
  /**
   * The armed-tool in-page preview ({@link GhostPolicy}). Defaults: inherited,
   * else off (the built-in stamp declares `footprint`).
   */
  ghost?: GhostPolicy;
  /** Opaque presentation hints (label/icon…) for a toolbar or cursor that builds
   *  itself from the tool table. Never read by the plugin or the interaction hub. */
  meta?: Record<string, unknown>;
}

export interface BuiltinToolKindMap {
  square: 'square';
  circle: 'circle';
  line: 'line';
  polygon: 'polygon';
  polyline: 'polyline';
  ink: 'ink';
  'ink-highlight': 'ink';
  'free-text': 'free-text';
  'free-text-callout': 'free-text-callout';
  highlight: 'highlight';
  underline: 'underline';
  strikeout: 'strikeout';
  squiggly: 'squiggly';
  'insert-text': 'caret';
  'replace-text': 'strikeout';
  redact: 'redact';
  stamp: 'stamp';
  note: 'text';
  attachment: 'file-attachment';
  link: 'link';
}

type DirectToolDef = {
  [K in ToolAuthoringKind]: Omit<AnnotationToolDef<K>, 'subtype'> & { subtype: K };
}[ToolAuthoringKind];
type BuiltinToolOverride = {
  [I in keyof BuiltinToolKindMap]: Omit<
    AnnotationToolDef<BuiltinToolKindMap[I]>,
    'id' | 'extends' | 'subtype'
  > & {
    id: I;
    extends?: never;
    subtype?: never;
  };
}[keyof BuiltinToolKindMap];
type ExtendedBuiltinToolDef = {
  [I in keyof BuiltinToolKindMap]: Omit<
    AnnotationToolDef<BuiltinToolKindMap[I]>,
    'extends' | 'subtype'
  > & {
    extends: I;
    subtype?: never;
  };
}[keyof BuiltinToolKindMap];

/** Public tool input: known overrides, known-base presets, or an explicit subtype. */
export type AnnotationToolInput = DirectToolDef | BuiltinToolOverride | ExtendedBuiltinToolDef;

/** A fully-resolved tool — what the plugin, handlers, and registration loop read. */
export interface ResolvedTool {
  id: string;
  /** Routing token for the draw core + the created annotation's PDF subtype. */
  subtype: Subtype;
  /** The `defaults` key (always the tool id) — keeps same-subtype tools apart. */
  preset: string;
  /** The `propsFor` key for the style panel. */
  propsKind: string;
  cursor: string;
  enables: ReadonlySet<string>;
  defaults?: AnnotationPropsPatch;
  /** `/F` seed for created annotations (see {@link AnnotationToolDef.flags}). */
  flags?: Partial<AnnotationFlags>;
  source?: StampSourceSpec;
  selection?: SelectionAuthoring;
  intent?: InkIntent;
  ink?: InkAuthoringOptions;
  /** Counter-rotate creations against the page's display rotation (see
   *  {@link AnnotationToolDef.upright}). */
  upright: boolean;
  /** What a bare click creates, or `false` for drag-only. */
  clickCreate: ClickCreate | false;
  /** The armed-tool in-page preview ({@link GhostPolicy}). */
  ghost: GhostPolicy;
  meta?: Record<string, unknown>;
}

// ── field groups shared by the built-ins (keeps the table readable) ──────────
const DRAW_TAGS = ['annotation-draw', 'annotation-edit'];
const MARKUP_TAGS = ['text-select', 'annotation-edit'];

/**
 * The built-in tools — a data mirror of v2's registrations (shapes + lines + ink
 * + free text in the draw channel, text markup + caret behind text selection, and
 * the click-to-place stamp). Order is display-neutral; the toolbar owns layout.
 */
export const DEFAULT_TOOLS: AnnotationToolInput[] = [
  // shapes / lines / ink / free text — the `annotation-draw` gesture.
  // Draw tools carry v2's click-create defaults (a bare click places a
  // default-size annotation); armed-tool identity rides the cursor, so none
  // of them needs a ghost.
  {
    id: 'square',
    subtype: 'square',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { strokeWidth: 6 },
    clickCreate: { width: 80, height: 60 },
  },
  {
    id: 'circle',
    subtype: 'circle',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { strokeWidth: 6 },
    clickCreate: { width: 80, height: 60 },
  },
  {
    id: 'line',
    subtype: 'line',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { strokeWidth: 6 },
    clickCreate: { length: 80 },
  },
  {
    id: 'polygon',
    subtype: 'polygon',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { strokeWidth: 6 },
  },
  {
    id: 'polyline',
    subtype: 'polyline',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { strokeWidth: 6 },
  },
  {
    id: 'ink',
    subtype: 'ink',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { color: '#ef4444', strokeWidth: 6, blendMode: 'normal' },
    ink: { groupStrokesMs: 800 },
  },
  {
    id: 'ink-highlight',
    extends: 'ink',
    intent: 'ink-highlight',
    defaults: { color: '#ffcd45', strokeWidth: 14, blendMode: 'multiply' },
    ink: {
      straighten: { deviationThreshold: 0.15, axisSnapDegrees: 15 },
    },
  },
  {
    id: 'free-text',
    subtype: 'free-text',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { fontColor: '#ef4444' },
    upright: true,
    // Top-left anchored: the box hangs where you'll type (the kind's reading
    // feel); shapes default to `center`. Anchoring is explicit policy data.
    clickCreate: { width: 180, height: 40, anchor: 'top-left' },
  },
  {
    // Routes on the `free-text-callout` subtype token but authors a `free-text`
    // annotation (leader + box). Its leader defaults to an open arrowhead.
    // `upright` applies to the text BOX only: on a rotated page it commits
    // counter-rotated (readable), while the leader tip/knee stay page-space
    // anchors — see the core's `calloutPointer`.
    id: 'free-text-callout',
    subtype: 'free-text-callout',
    propsKind: 'free-text',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
    defaults: { strokeWidth: 6, lineEndings: { end: 'open-arrow' } },
    upright: true,
  },
  // text markup — the `text-select` gesture (inert without a selection plugin).
  // Base cursor is the plain arrow: the I-beam appears only where the action is
  // possible, via the selection handler's over-text claim (which an app can
  // reskin with the tool's icon — see the hub's ToolCursorSkin).
  {
    id: 'highlight',
    subtype: 'highlight',
    cursor: 'default',
    enables: MARKUP_TAGS,
    defaults: { color: '#ffe16a', blendMode: 'multiply' },
    selection: { kind: 'markup' },
  },
  // Redaction marking — the COMPOSED tool: over text it rides the selection
  // gesture (per-line quad marks, like a highlight); anywhere else it drag-
  // draws an area mark. One tool, both modes; the destructive apply lives in
  // plugin-redaction.
  {
    id: 'redact',
    subtype: 'redact',
    cursor: 'crosshair',
    enables: ['text-select', 'annotation-draw', 'annotation-edit'],
    defaults: {
      color: '#e44234',
      interiorColor: '#000000',
      fontColor: '#ffffff',
      opacity: 1,
    },
    selection: { kind: 'markup' },
  },
  {
    id: 'underline',
    subtype: 'underline',
    cursor: 'default',
    enables: MARKUP_TAGS,
    defaults: { color: '#ef4444' },
    selection: { kind: 'markup' },
  },
  {
    id: 'strikeout',
    subtype: 'strikeout',
    cursor: 'default',
    enables: MARKUP_TAGS,
    defaults: { color: '#ef4444' },
    selection: { kind: 'markup' },
  },
  {
    id: 'squiggly',
    subtype: 'squiggly',
    cursor: 'default',
    enables: MARKUP_TAGS,
    defaults: { color: '#ef4444' },
    selection: { kind: 'markup' },
  },
  {
    // The insert-caret tool authors a `caret` from a text selection. Its defaults
    // live under the `caret` preset — the key `createCaret` resolves.
    id: 'insert-text',
    subtype: 'caret',
    propsKind: 'caret',
    preset: 'caret',
    cursor: 'default',
    enables: MARKUP_TAGS,
    defaults: { color: '#ef4444' },
    selection: { kind: 'text-edit', operation: 'insert' },
  },
  {
    id: 'replace-text',
    subtype: 'strikeout',
    propsKind: 'strikeout',
    cursor: 'default',
    enables: MARKUP_TAGS,
    defaults: { color: '#ef4444' },
    selection: { kind: 'text-edit', operation: 'replace' },
  },
  // stamp — click-to-place; 'prompt' asks the environment through the ONE
  // file-picker port (the React adapter wires a file dialog by default; an
  // embedder can pass fixed bytes instead). `accept` narrows the dialog to
  // what the engine's stamp sniffer takes anyway.
  {
    id: 'stamp',
    subtype: 'stamp',
    cursor: 'copy',
    enables: ['annotation-place', 'annotation-edit'],
    source: { kind: 'prompt', accept: 'image/png,image/jpeg,application/pdf' },
    upright: true,
    ghost: { mode: 'footprint' },
  },
  // link — drag an invisible hit rectangle; the target is set afterwards
  // through the selection editor (create-then-edit), unless a preset carries
  // a fixed one (`{ id: 'docs-link', extends: 'link', defaults: { link: … } }`).
  // While this tool is active the navigation plane stands down (no `link-nav`),
  // so existing links become plain editable rects.
  {
    id: 'link',
    subtype: 'link',
    cursor: 'crosshair',
    enables: DRAW_TAGS,
  },
  // sticky note ("comment") — click-to-place, no payload: each click drops a
  // fixed 20×20 icon (engine-baked /AP from /C + /Name), screen-sized and
  // upright per the spec's Text-icon rule (the noZoom/noRotate seed).
  {
    id: 'note',
    subtype: 'text',
    cursor: 'crosshair',
    enables: ['annotation-place', 'annotation-edit'],
    defaults: { icon: 'comment', color: '#facc15' },
    flags: { noZoom: true, noRotate: true },
    upright: true,
    ghost: { mode: 'footprint' },
  },
  // file attachment — click-to-place with the spot-first-file-second rule:
  // the click opens the installed file-picker port (a file dialog by
  // default; `accept` unset = any file — attaching any format is the point);
  // the picked file embeds at the clicked point.
  {
    id: 'attachment',
    subtype: 'file-attachment',
    cursor: 'copy',
    enables: ['annotation-place', 'annotation-edit'],
    source: { kind: 'prompt' },
    defaults: { icon: 'paperclip', color: '#facc15' },
    flags: { noZoom: true, noRotate: true },
    upright: true,
    ghost: { mode: 'footprint' },
  },
];

/** Merge two default patches, `b` over `a`, with line endings merged per side. */
function mergeDefaults(
  a?: AnnotationPropsPatch,
  b?: AnnotationPropsPatch,
): AnnotationPropsPatch | undefined {
  if (!a) return b;
  if (!b) return a;
  const merged: AnnotationPropsPatch = { ...a, ...b };
  if (a.lineEndings || b.lineEndings) merged.lineEndings = { ...a.lineEndings, ...b.lineEndings };
  return merged;
}

/** Overlay a same-id override onto a base definition (configure a built-in). */
function mergeDef(base: AnnotationToolDef, over: AnnotationToolDef): AnnotationToolDef {
  return {
    ...base,
    ...over,
    enables: over.enables ?? base.enables,
    meta: base.meta || over.meta ? { ...base.meta, ...over.meta } : undefined,
    defaults: mergeDefaults(base.defaults, over.defaults),
    flags: base.flags || over.flags ? { ...base.flags, ...over.flags } : undefined,
    ink: base.ink || over.ink ? { ...base.ink, ...over.ink } : undefined,
  };
}

function validateDefaults(tool: ResolvedTool): void {
  if (!tool.defaults) return;
  const allowed = TOOL_DEFAULT_KEYS[tool.subtype as ToolAuthoringKind];
  // Unknown/custom routing kinds remain extensible; known built-ins are strict.
  if (!allowed) return;
  const keys = new Set<string>(allowed);
  for (const key of Object.keys(tool.defaults)) {
    if (!keys.has(key)) {
      throw new Error(
        `[annotation] tool '${tool.id}' does not support default '${key}' for '${tool.subtype}'`,
      );
    }
  }
}

/**
 * Resolve {@link DEFAULT_TOOLS} + embedder overrides into the ready-to-use table.
 * A same-id override merges over the built-in; a new id adds a tool; `extends`
 * inherits from an already-defined tool. Keyed by id, so lookups are O(1).
 */
export function buildToolRegistry(
  overrides: AnnotationToolInput[] = [],
): Map<string, ResolvedTool> {
  const defs = new Map<string, AnnotationToolDef>();
  for (const d of DEFAULT_TOOLS) defs.set(d.id, d);
  for (const o of overrides) {
    const prev = defs.get(o.id);
    defs.set(o.id, prev ? mergeDef(prev, o) : o);
  }

  const out = new Map<string, ResolvedTool>();
  const resolving = new Set<string>();
  const resolve = (id: string): ResolvedTool => {
    const cached = out.get(id);
    if (cached) return cached;
    const def = defs.get(id);
    if (!def) throw new Error(`[annotation] tool '${id}' extends an unknown tool`);
    // Inherit from the base first (guarding self / cyclic extends), then own fields win.
    let base: ResolvedTool | undefined;
    if (def.extends && def.extends !== id && !resolving.has(def.extends)) {
      resolving.add(id);
      base = resolve(def.extends);
      resolving.delete(id);
    }
    const subtype = (def.subtype ?? base?.subtype ?? def.id) as Subtype;
    const resolved: ResolvedTool = {
      id: def.id,
      subtype,
      preset: def.preset ?? def.id,
      propsKind: def.propsKind ?? base?.propsKind ?? subtype,
      cursor: def.cursor ?? base?.cursor ?? 'crosshair',
      enables: new Set(def.enables ?? (base ? [...base.enables] : [])),
      defaults: mergeDefaults(base?.defaults, def.defaults),
      flags: base?.flags || def.flags ? { ...base?.flags, ...def.flags } : undefined,
      source: def.source ?? base?.source,
      selection: def.selection ?? base?.selection,
      intent: def.intent ?? base?.intent,
      ink: base?.ink || def.ink ? { ...base?.ink, ...def.ink } : undefined,
      upright: def.upright ?? base?.upright ?? false,
      clickCreate: def.clickCreate ?? base?.clickCreate ?? false,
      ghost: def.ghost ?? base?.ghost ?? false,
      meta: base?.meta || def.meta ? { ...base?.meta, ...def.meta } : undefined,
    };
    validateDefaults(resolved);
    out.set(id, resolved);
    return resolved;
  };
  for (const id of defs.keys()) resolve(id);
  return out;
}
