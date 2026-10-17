import { createHostToken, type EventHook, type PageRef, type Unsubscribe } from '@embedpdf/core';
import type { PageRotation, Point } from '@embedpdf/core-geometry';

import { InteractionToken as PublicInteractionToken } from './contract';
import type {
  Cursor,
  InteractionCapability,
  Modifiers,
  PointerKind,
  RegisterToolOptions,
  Tool,
  ToolId,
} from './contract';

/**
 * A tool as plugins see it: a public tool plus the behavior tags it turns on.
 * A tool doesn't act by itself: handlers opt into tags (`enabledFor`), so a
 * tool composes features without depending on them. A tool registered without
 * tags has none.
 */
export interface HostTool extends Tool {
  /** The behavior tags the tool turns on, such as `'text-select'` or `'annotation-draw'`. */
  readonly enables: ReadonlySet<string>;
  /**
   * The cursor over the space between pages. Most tools act only on pages, so
   * the gaps show the plain arrow (`'default'`); a tool that works anywhere
   * (pan) names its own (`'grab'`). Hover claims outrank both.
   */
  readonly gapCursor?: Cursor;
}

/** A tool as a plugin registers it: its tags may be left out. */
export type HostToolInput = Tool & Partial<Pick<HostTool, 'enables' | 'gapCursor'>>;

export type Phase = 'down' | 'move' | 'up' | 'cancel';

/**
 * One normalized pointer event. `viewport` is the source container's px. `page`
 * is the resolved page hit (its `ref` and page-space point), present when the
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
  /** Absent when the source can't say: treat as 'mouse'. */
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
 * handler that captures it.
 */
export interface InteractionHandler {
  id: string;
  /** Higher wins the gesture. */
  priority: number;
  /** Usually `tool.enables.has('my-tag')`. */
  enabledFor(tool: HostTool): boolean;
  /** Return true to capture: subsequent move/up route here until pointer-up. */
  onDown(sample: PointerSample): boolean;
  onMove?(sample: PointerSample): void;
  onUp?(sample: PointerSample): void;
  /** The gesture was aborted, not completed. Falls back to `onUp` when absent. */
  onCancel?(sample: PointerSample): void;
  /** Pointer moved with no active gesture: cursor feedback only. */
  onHover?(sample: PointerSample): void;
  /** Touch consent, second rung: a pure read asked before a touch contact is classified. */
  claimsTouch?(sample: PointerSample): boolean;
}

/**
 * The host lens: what pointer sources (the Stage surface, `PagePointerSource`)
 * and feature plugins with gestures need. The same runtime token as the
 * public contract, typed wider. Application code never needs it.
 */
export interface InteractionHostCapability extends InteractionCapability {
  getActiveTool(): HostTool;
  listTools(): readonly HostTool[];
  getTool(id: ToolId): HostTool | null;
  /** Add a tool, with the behavior tags it turns on. The rules are those of the public `registerTool`. */
  registerTool(tool: HostToolInput, options?: RegisterToolOptions): Unsubscribe;
  /** Whether the active tool turns on a behavior tag such as `'text-select'`. */
  activeToolEnables(behavior: string): boolean;
  /** Pointer ingress: a source calls it for every normalized event. */
  dispatchPointer(sample: PointerSample): void;
  /** Touch-arbitration pre-flight: would any eligible handler claim this contact. Pure. */
  wouldClaimTouch(sample: PointerSample): boolean;
  /** Register a pointer handler; `source` scopes it to one lens. */
  registerHandler(handler: InteractionHandler, options?: { source?: string }): Unsubscribe;
  /** Push or clear a cursor claim on the priority stack (hover feedback). */
  claimCursor(token: string, cursor: Cursor | null, priority?: number): void;
  /**
   * Whether a hover claim holds the cursor: the pointer is over something a
   * click acts on instead of the tool (an annotation, text). A handler's hover
   * sees the claims of every handler above it, so a create handler asks this
   * to know whether its click would reach it (its ghost shows only then).
   */
  hasCursorClaim(): boolean;
  /** The resolved cursor string. */
  getCursor(): Cursor;
  /** The resolved cursor changed. */
  readonly onCursorChanged: EventHook<{ readonly cursor: Cursor }>;
}

export const InteractionToken = createHostToken<InteractionHostCapability>(PublicInteractionToken);

/**
 * Resolve a sample against a gesture's home page: prefer the source's
 * unclamped projection, fall back to the page hit only when it is the same
 * page. Null: this sample can't speak for the home page.
 */
export const samplePointOn = (sample: PointerSample, page: PageRef): Point | null =>
  sample.project?.(page) ??
  (sample.page?.ref.objectNumber === page.objectNumber ? sample.page.point : null);

// The host entry is a superset of the public contract: everything public is reachable here too.
export * from './contract';
