import { createCapabilityToken, type PageObjectNumber } from '@embedpdf/core';
import type { PageRotation, Point } from '@embedpdf/core-geometry';

export type ToolId = string;
export type Cursor = string;

export interface Modifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

/**
 * The single active arbiter of what the pointer does. `pan` and `pointer` are
 * built in; features add more (`highlight`, `square`, `redact`…) via
 * `registerTool`. A tool carries no behaviour itself — it turns on capability
 * TAGS that handlers opt into (`enables`), so tools compose features without
 * coupling to them.
 */
export interface Tool {
  id: ToolId;
  cursor: Cursor;
  /**
   * Cursor over the viewport's page GAPS. A tool's cursor answers "what would
   * a click do here" — and most tools act only on pages, so gaps fall back to
   * the neutral arrow (`'default'`). A tool that works anywhere (pan) declares
   * its own (`'grab'`). Hover claims still outrank both.
   */
  gapCursor?: Cursor;
  enables: ReadonlySet<string>;
}

export type Phase = 'down' | 'move' | 'up' | 'cancel';

/** The physical device class behind a sample — `PointerEvent.pointerType`.
 *  Adapters fill it so handlers (and arbitration above the hub) can apply
 *  modality policy: touch navigates first, pen/mouse are tool-first. */
export type PointerKind = 'mouse' | 'pen' | 'touch';

/**
 * One normalized pointer event. `viewport` is the source container's px (the pan
 * handler uses the delta). `page` is the resolved page hit — its `pon` + content
 * point (y-down, PDF units, via the page's transform) — present when the pointer
 * is over a page, absent over gaps. A viewport source (Stage) resolves `page` per
 * event (so a drag can cross pages); a per-page source (PageView) always sets it.
 */
export interface PointerSample {
  phase: Phase;
  viewport: Point;
  /** `scale` is the hit page's VIEW px per content unit — handlers use it to
   *  convert screen-px chrome settings into content-space tolerances, so grab
   *  zones stay screen-constant across zoom. `rotation` is the hit page's TOTAL
   *  display rotation (document /Rotate + view rotation) — per-event
   *  environmental context like `scale`, for placement rules that depend on how
   *  the page is DISPLAYED (an upright stamp). `zoom` is the page's zoom
   *  RELATIVE to its 100% baseline (`transform.zoom` — dimensionless, 1 =
   *  Acrobat's 100%), for zoom-relative policies (the `/F` NoZoom exemption);
   *  distinct from `scale`, which is a units conversion. Absent when the
   *  source can't say. */
  page?: {
    pon: PageObjectNumber;
    point: Point;
    scale?: number;
    rotation?: PageRotation;
    zoom?: number;
  };
  modifiers: Modifiers;
  /**
   * Click count for a `down` (1 = single, 2 = double, 3 = triple), from the
   * browser's native multi-click detection (`MouseEvent.detail`). Lets handlers
   * do word/line selection without re-implementing timing. Defaults to 1.
   */
  clickCount?: number;
  /** The device class that produced this sample (see {@link PointerKind}).
   *  Absent when the source can't say — treat as 'mouse'. */
  pointerType?: PointerKind;
  /**
   * Project this event onto a SPECIFIC page's content space, unclamped — valid
   * (and expected) outside the page's bounds. `page` answers "what is under the
   * cursor" and re-resolves per event; `project` answers "where is the cursor
   * in MY page's frame" for a gesture anchored to the page it started on (an
   * annotation drag sliding along the page edge). Null when the source can't
   * project onto that page (not laid out / a per-page source's foreign page).
   */
  project?(pon: PageObjectNumber): Point | null;
}

/**
 * A pointer handler contributed by a feature plugin. The ONE registration
 * mechanism (replacing v2's registerMode / registerHandlers / registerAlways /
 * enableForMode quartet): a handler declares which tools it's live under and a
 * priority; the hub routes each gesture to the first handler that captures it.
 */
export interface InteractionHandler {
  id: string;
  /** Higher wins the gesture. */
  priority: number;
  /** Usually `tool.enables.has('my-tag')`. */
  enabledFor(tool: Tool): boolean;
  /** Return true to CAPTURE: subsequent move/up route here until pointer-up. */
  onDown(sample: PointerSample): boolean;
  onMove?(sample: PointerSample): void;
  onUp?(sample: PointerSample): void;
  /**
   * The gesture was ABORTED, not completed — the pointer was cancelled by the
   * system, or navigation took it over (a second finger converted the drag
   * into a pinch). Discard the in-flight work instead of committing it (a
   * half-drawn shape, a mid-drag selection). Falls back to {@link onUp} when
   * absent, since committing is the lesser evil to a stuck gesture.
   */
  onCancel?(sample: PointerSample): void;
  /** Pointer moved with no active gesture — cursor feedback only. */
  onHover?(sample: PointerSample): void;
}

/**
 * A tool's runtime cursor skin: "while THIS tool is armed, keyword X looks
 * like Y." Everything cursor-shaped in the hub speaks KEYWORDS — a tool
 * declares its base ('crosshair', 'copy'), hover claims name what is under
 * the pointer ('text' over text, 'move' over an annotation) — and the skin
 * restyles those keywords, typically as image cursors carrying the tool's
 * icon. Applied uniformly to the winning claim and to the declared base, so
 * same keyword = same meaning = same look. Unmapped keywords render as-is (a
 * foreign 'move' over an annotation drops the tool identity), and page gaps
 * are never skinned — the identity appears exactly where the action is
 * possible, and the skin can only restyle where the tool already acts.
 */
export type ToolCursorSkin = Record<Cursor, Cursor>;

export interface InteractionState {
  activeToolId: ToolId;
  cursor: Cursor;
}

export type InteractionAction =
  | { type: 'SET_TOOL'; toolId: ToolId }
  | { type: 'SET_CURSOR'; cursor: Cursor };

export interface InteractionCapability {
  // ── selectors ──
  activeTool(): Tool;
  activeToolId(): ToolId;
  cursor(): Cursor;
  tools(): Tool[];
  // ── tool intents ──
  activateTool(id: ToolId): void;
  /** Fires after the active tool changes — lets a feature react (e.g. a markup
   *  tool taking over the selection visual). Returns an unsubscribe fn. */
  onToolChange(cb: () => void): () => void;
  /**
   * Reskin a tool's cursor keywords at runtime — how an app gives the armed
   * tool an image cursor built from its own toolbar icon (`Cursor` is any CSS
   * cursor string, `url(data:…) x y, crosshair` included). See
   * {@link ToolCursorSkin} for what the map means. `null` removes the skin.
   */
  setToolCursor(id: ToolId, skin: ToolCursorSkin | null): void;
  // ── registries (return an unregister fn) ──
  registerTool(tool: Tool): () => void;
  registerHandler(handler: InteractionHandler): () => void;
  // ── cursor claim stack (highest priority wins; null clears the token) ──
  setCursor(token: string, cursor: Cursor | null, priority?: number): void;
  // ── pointer ingress: the adapter calls this for every normalized event ──
  dispatch(sample: PointerSample): void;
}

export const InteractionToken = createCapabilityToken<InteractionCapability>('interaction');

/**
 * Resolve a sample against a gesture's HOME page. Page-anchored gestures track
 * the page they started on even when the cursor wanders off it — `s.page`
 * re-resolves per event (a foreign page is a DIFFERENT coordinate frame), so
 * prefer the source's unclamped projection and fall back to the page hit only
 * when it is the same page. Null → this sample can't speak for the home page.
 * Shared by every gesture owner (annotation edit/draw, form placement).
 */
export const samplePointOn = (s: PointerSample, pon: PageObjectNumber): Point | null =>
  s.project?.(pon) ?? (s.page?.pon === pon ? s.page.point : null);

export interface InteractionConfig {
  /** Tool active when a document opens. Default `'pointer'`. */
  defaultTool?: ToolId;
}
