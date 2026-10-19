import {
  type DeepPartial,
  type EventHook,
  type PageRef,
  type SettingsApi,
  type Unsubscribe,
} from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';

export { FeedbackToken } from './feedback.types';
export type { FeedbackPluginOptions, PlatformFeedback } from './feedback.types';

export type ToolId = string;

/** A CSS cursor: a keyword such as `'crosshair'`, or an image built with `svgCursor()`. */
export type Cursor = string;

export interface Modifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

/** The physical device class behind a pointer: `PointerEvent.pointerType`. */
export type PointerKind = 'mouse' | 'pen' | 'touch';

/**
 * What one finger does on a touch screen while the tool is active. `'draw'`:
 * one finger drives the tool, and two fingers scroll and zoom, for tools you
 * drag with. `'tap'`: a tap is a click and a drag scrolls, for tools you click
 * with.
 */
export type ToolTouch = 'draw' | 'tap';

/** The pointer on a page, as a tool's own pointer methods receive it. */
export interface ToolPointerEvent {
  /** The page under the pointer. During a gesture the tool took, the page it started on. */
  readonly page: PageRef;
  /**
   * Where on that page, in page coordinates. During a gesture that leaves its
   * page, the point lies outside the page's box.
   */
  readonly point: Point;
  readonly modifiers: Modifiers;
  readonly pointerType: PointerKind;
}

/**
 * A tool: what the pointer does on the page while it is active. `pointer` and
 * `pan` are built in, and plugins add their own. A tool of your own handles
 * the pointer itself with its pointer methods, in page coordinates.
 */
export interface Tool {
  /** The tool's name, for `activateTool(id)`. */
  readonly id: ToolId;
  /** The cursor over the page while the tool is active. */
  readonly cursor: Cursor;
  /** What one finger does on a touch screen. Default `'tap'`. */
  readonly touch?: ToolTouch;
  /**
   * A press on a page. Return `true` to take the gesture: its moves and its
   * release then come to `onPointerMove` and `onPointerUp`, and nothing else
   * acts on it.
   */
  onPointerDown?(event: ToolPointerEvent): boolean | void;
  /** The pointer moved during a gesture the tool took. */
  onPointerMove?(event: ToolPointerEvent): void;
  /**
   * The gesture the tool took ended: the button or finger was released, or the
   * gesture was cancelled, for example by a second finger.
   */
  onPointerUp?(event: ToolPointerEvent): void;
  /** The pointer moved over a page with no button pressed. */
  onHover?(event: ToolPointerEvent): void;
}

/** A tool's cursors replaced by name: "while this tool is active, show cursor X as Y". */
export type ToolCursors = Readonly<Record<Cursor, Cursor>>;

// ── settings ──────────────────────────────────────────────────────────────

/**
 * The interaction plugin's settings. `interactionPlugin(config)` registers
 * them over {@link INTERACTION_DEFAULTS}, and `updateSettings()` changes them
 * for every document while the app runs.
 */
export interface InteractionSettings {
  /** The tool that's active when a document opens. */
  readonly defaultTool: ToolId;
  /** Tools of your own, registered from the start beside the built-in ones. */
  readonly tools: readonly Tool[];
}

/** What the interaction settings are when the app registers none. */
export const INTERACTION_DEFAULTS: InteractionSettings = { defaultTool: 'pointer', tools: [] };

/** What `interactionPlugin(config)` takes: any of the settings, merged over the defaults. */
export type InteractionConfig = DeepPartial<InteractionSettings>;

export interface RegisterToolOptions {
  /** Replace a tool registered under the same id instead of refusing. */
  readonly replace?: boolean;
}

// ── events ────────────────────────────────────────────────────────────────

export interface ToolChangedEvent {
  readonly toolId: ToolId;
  readonly previousToolId: ToolId;
}

export interface GestureStartedEvent {
  /** The tool that was active when the gesture began. */
  readonly toolId: ToolId;
  /** The page the gesture began on, or null over the space between pages. */
  readonly page: PageRef | null;
  readonly pointerType: PointerKind;
}

export interface GestureEndedEvent {
  /** The tool that was active when the gesture began. */
  readonly toolId: ToolId;
  /** The page the gesture began on, or null over the space between pages. */
  readonly page: PageRef | null;
  readonly pointerType: PointerKind;
}

export interface GestureCancelledEvent {
  /** The tool that was active when the gesture began. */
  readonly toolId: ToolId;
  /** The page the gesture began on, or null over the space between pages. */
  readonly page: PageRef | null;
  readonly pointerType: PointerKind;
}

/**
 * The tools of one document: which one is active, the tools you can switch
 * to, and the events that report tool changes and gestures. Its settings
 * (`getSettings`, `updateSettings`, `resetSettings`, `onSettingsChanged`)
 * belong to the plugin, not to a document: a change reaches every open
 * document.
 */
export interface InteractionCapability extends SettingsApi<InteractionSettings> {
  /** The active tool. */
  getActiveTool(): Tool;
  getActiveToolId(): ToolId;
  /** The tool a document opens with: the `defaultTool` setting. */
  getDefaultToolId(): ToolId;
  /** Every tool, in the order they were added, the built-in ones first. The same array until a tool is added or removed. */
  listTools(): readonly Tool[];
  getTool(id: ToolId): Tool | null;
  hasTool(id: ToolId): boolean;
  /**
   * Make a tool the active one, and forget the tools `pushTool` saved. Fires
   * `onToolChanged`. Throws `not-found` for an id that isn't registered.
   */
  activateTool(id: ToolId): void;
  /** Make the default tool the active one. Fires `onToolChanged`. */
  activateDefaultTool(): void;
  /**
   * Make a tool the active one for a moment, remembering the active one for
   * `popTool`. Fires `onToolChanged`. Throws `not-found` for an id that isn't
   * registered.
   */
  pushTool(id: ToolId): void;
  /** Go back to the tool active before the last `pushTool`; nothing to go back to does nothing. */
  popTool(): void;
  /**
   * Replace a tool's cursors by name while the app runs (`{ crosshair: penCursor }`);
   * `null` brings the tool's own back.
   */
  setToolCursor(id: ToolId, cursors: ToolCursors | null): void;
  /**
   * Add a tool, and return a function that removes it again. Throws
   * `conflict` for an id that's taken, unless `{ replace: true }`; the
   * function only removes this registration, not a later one with its id.
   */
  registerTool(tool: Tool, options?: RegisterToolOptions): Unsubscribe;

  /**
   * A tool became active (`activateTool`, `activateDefaultTool`, `pushTool`,
   * `popTool`), including activating the active tool again.
   */
  readonly onToolChanged: EventHook<ToolChangedEvent>;
  /** A press began a gesture that a tool took. */
  readonly onGestureStarted: EventHook<GestureStartedEvent>;
  /** That gesture ended with a release. */
  readonly onGestureEnded: EventHook<GestureEndedEvent>;
  /** That gesture was cancelled, for example by a second finger. */
  readonly onGestureCancelled: EventHook<GestureCancelledEvent>;
}

export { InteractionToken } from './token';
