import { type EventHook, type PageRef, type Unsubscribe } from '@embedpdf/core';
import type { PageRotation, Point } from '@embedpdf/core-geometry';

export { FeedbackToken } from './feedback.types';
export type { FeedbackPluginOptions, PlatformFeedback } from './feedback.types';

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
 * tags that handlers opt into (`enables`), so tools compose features without
 * coupling to them.
 */
export interface Tool {
  id: ToolId;
  cursor: Cursor;
  /**
   * Cursor over the viewport's page gaps. Most tools act only on pages, so
   * gaps fall back to the neutral arrow (`'default'`); a tool that works
   * anywhere (pan) declares its own (`'grab'`). Hover claims outrank both.
   */
  gapCursor?: Cursor;
  enables: ReadonlySet<string>;
  /**
   * Touch consent, first rung — "arming this tool is consent to create with
   * a finger": while it is active, single-finger touch routes to the hub
   * wholesale and navigation moves to two fingers. Default false.
   */
  touchDirect?: boolean;
}

export type Phase = 'down' | 'move' | 'up' | 'cancel';

/** The physical device class behind a sample — `PointerEvent.pointerType`. */
export type PointerKind = 'mouse' | 'pen' | 'touch';

/**
 * One normalized pointer event. `viewport` is the source container's px. `page`
 * is the resolved page hit — its `ref` + page-space point — present when the
 * pointer is over a page, absent over gaps.
 */
export interface PointerSample {
  phase: Phase;
  viewport: Point;
  /** `scale` = view px per page unit; `rotation` = the page's total display
   *  rotation; `zoom` = the page's zoom relative to its 100% baseline. */
  page?: {
    ref: PageRef;
    point: Point;
    scale?: number;
    rotation?: PageRotation;
    zoom?: number;
  };
  modifiers: Modifiers;
  /** Click count for a `down` (1 single, 2 double, 3 triple). Defaults to 1. */
  clickCount?: number;
  /** Absent when the source can't say — treat as 'mouse'. */
  pointerType?: PointerKind;
  /** Present when the sample was synthesized from a recognized gesture. */
  gesture?: 'long-press';
  /** The lens this sample came from (the stage plugin id); absent = route everywhere. */
  source?: string;
  /** Project this event onto a specific page's frame, unclamped; null when the source cannot. */
  project?(page: PageRef): Point | null;
}

/**
 * A pointer handler contributed by a feature plugin: it declares which tools
 * it is live under and a priority; the hub routes each gesture to the first
 * handler that captures it. Registered through the host contract.
 */
export interface InteractionHandler {
  id: string;
  /** Higher wins the gesture. */
  priority: number;
  /** Usually `tool.enables.has('my-tag')`. */
  enabledFor(tool: Tool): boolean;
  /** Return true to capture: subsequent move/up route here until pointer-up. */
  onDown(sample: PointerSample): boolean;
  onMove?(sample: PointerSample): void;
  onUp?(sample: PointerSample): void;
  /** The gesture was aborted, not completed. Falls back to `onUp` when absent. */
  onCancel?(sample: PointerSample): void;
  /** Pointer moved with no active gesture — cursor feedback only. */
  onHover?(sample: PointerSample): void;
  /** Touch consent, second rung: a pure read asked before a touch contact is classified. */
  claimsTouch?(sample: PointerSample): boolean;
}

/** A tool's runtime cursor skin: "while this tool is armed, keyword X looks like Y." */
export type ToolCursorSkin = Record<Cursor, Cursor>;

export interface InteractionConfig {
  /** Tool active when a document opens. Default `'pointer'`. */
  defaultTool?: ToolId;
  /** Tools registered at construction, beside the built-in `pointer` and `pan`. */
  tools?: readonly Tool[];
}

export interface ActivateToolOptions {
  /** Handed to the owning plugin through `ToolChangedEvent.payload` (an armed stamp, a preset). */
  readonly payload?: unknown;
}

export interface RegisterToolOptions {
  /** Replace an existing registration with the same id instead of rejecting it. */
  readonly replace?: boolean;
}

// ── events ────────────────────────────────────────────────────────────────

export interface ToolChangedEvent {
  readonly toolId: ToolId;
  readonly previousToolId: ToolId;
  readonly tool: Tool;
  readonly payload?: unknown;
}

export interface GestureEvent {
  readonly handlerId: string;
  readonly page: PageRef | null;
  readonly pointerType: PointerKind;
}

/**
 * The tool hub: one active tool per document, a tool registry, and the
 * events that report tool and gesture changes. Pointer routing, cursor
 * claims and handler registration live on the host contract
 * (`@embedpdf/plugin-interaction/contract/host`).
 */
export interface InteractionCapability {
  /** The armed tool. */
  getActiveTool(): Tool;
  getActiveToolId(): ToolId;
  /** The tool configured for a freshly opened document. */
  getDefaultToolId(): ToolId;
  /** Registered tools in registration order. Reference-stable until a tool is registered or removed. */
  listTools(): readonly Tool[];
  getTool(id: ToolId): Tool | null;
  hasTool(id: ToolId): boolean;
  /** Does the active tool enable a behaviour tag such as `'text-select'`. */
  activeToolEnables(behavior: string): boolean;
  /** Arm a tool and fire `onToolChanged`. Throws `not-found` for an unknown id. */
  activateTool(id: ToolId, options?: ActivateToolOptions): void;
  activateDefaultTool(): void;
  /** Temporarily arm a tool (hold space to pan); `popTool` restores the previous one. */
  pushTool(id: ToolId, options?: ActivateToolOptions): void;
  popTool(): void;
  /** Reskin a tool's cursor keywords at runtime; `null` removes the skin. */
  setToolCursor(id: ToolId, skin: ToolCursorSkin | null): void;
  /**
   * Add a tool and wake readers. A duplicate id throws `conflict` unless
   * `{ replace: true }`; the remover only removes this registration.
   */
  registerTool(tool: Tool, options?: RegisterToolOptions): Unsubscribe;

  /**
   * A tool was armed (`activateTool`, `activateDefaultTool`, `pushTool`,
   * `popTool`). Fires on every activation, including re-arming the armed
   * tool, because the payload may be new.
   */
  readonly onToolChanged: EventHook<ToolChangedEvent>;
  /** A handler captured a pointer-down. */
  readonly onGestureStarted: EventHook<GestureEvent>;
  /** The captured gesture completed on pointer-up. */
  readonly onGestureEnded: EventHook<GestureEvent>;
  /** The captured gesture was aborted. */
  readonly onGestureCancelled: EventHook<GestureEvent>;
}

export { InteractionToken } from './token';

/**
 * Resolve a sample against a gesture's home page: prefer the source's
 * unclamped projection, fall back to the page hit only when it is the same
 * page. Null → this sample can't speak for the home page.
 */
export const samplePointOn = (sample: PointerSample, page: PageRef): Point | null =>
  sample.project?.(page) ??
  (sample.page?.ref.pageObjectNumber === page.pageObjectNumber ? sample.page.point : null);
