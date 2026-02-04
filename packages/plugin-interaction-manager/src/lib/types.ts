import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Position } from '@embedpdf/models';

export interface InteractionManagerPluginConfig extends BasePluginConfig {
  /** Initial exclusion rules */
  exclusionRules?: InteractionExclusionRules;
}

// Per-document interaction state
export interface InteractionDocumentState {
  /** Mode-id that is currently active for this document */
  activeMode: string;
  /** Cursor that is currently active for this document */
  cursor: string;
  /** Whether interaction is paused for this document */
  paused: boolean;
}

export interface InteractionManagerState {
  // Global settings (shared across all documents)
  defaultMode: string;
  exclusionRules: InteractionExclusionRules;

  // Per-document state
  documents: Record<string, InteractionDocumentState>;
  activeDocumentId: string | null;
}

export interface InteractionExclusionRules {
  /** Class names that should be excluded */
  classes?: string[];
  /** Data attributes that should be excluded (e.g., 'data-no-interaction') */
  dataAttributes?: string[];
}

export interface InteractionMode {
  /** unique id */
  id: string;
  /** where the handlers should listen for events */
  scope: 'global' | 'page';
  /** if true the page will receive events through a transparent overlay */
  exclusive: boolean;
  /** baseline cursor while the mode is active */
  cursor?: string;
  /** Set to `false` when this tool wants to disable raw touch events */
  wantsRawTouch?: boolean;
}

/**
 * Extensions added to pointer events by the interaction manager.
 * These methods are added on top of whatever native event type is used.
 */
export interface EmbedPdfPointerEventExtensions {
  /** Prevents remaining handlers from being called for this event */
  stopImmediatePropagation(): void;
  /** Returns true if stopImmediatePropagation() was called */
  isImmediatePropagationStopped(): boolean;
  setPointerCapture?(): void;
  releasePointerCapture?(): void;
}

/**
 * Base properties available when no native event type is specified.
 * Used in plugin layer where DOM types are not available.
 */
export interface EmbedPdfPointerEventBase {
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: unknown;
  currentTarget: unknown;
}

/**
 * Pointer event type that combines a native event with our extensions.
 *
 * Usage:
 * - Plugin layer: `EmbedPdfPointerEvent` (uses base properties)
 * - React: `EmbedPdfPointerEvent<React.MouseEvent>`
 * - Vue/Svelte: `EmbedPdfPointerEvent<PointerEvent>`
 */
export type EmbedPdfPointerEvent<T = EmbedPdfPointerEventBase> = T & EmbedPdfPointerEventExtensions;

export interface PointerEventHandlers<T = EmbedPdfPointerEvent> {
  onPointerDown?(pos: Position, evt: T, modeId: string): void;
  onPointerUp?(pos: Position, evt: T, modeId: string): void;
  onPointerMove?(pos: Position, evt: T, modeId: string): void;
  onPointerEnter?(pos: Position, evt: T, modeId: string): void;
  onPointerLeave?(pos: Position, evt: T, modeId: string): void;
  onPointerCancel?(pos: Position, evt: T, modeId: string): void;
  onMouseDown?(pos: Position, evt: T, modeId: string): void;
  onMouseUp?(pos: Position, evt: T, modeId: string): void;
  onMouseMove?(pos: Position, evt: T, modeId: string): void;
  onMouseEnter?(pos: Position, evt: T, modeId: string): void;
  onMouseLeave?(pos: Position, evt: T, modeId: string): void;
  onMouseCancel?(pos: Position, evt: T, modeId: string): void;
  onClick?(pos: Position, evt: T, modeId: string): void;
  onDoubleClick?(pos: Position, evt: T, modeId: string): void;
}

export interface PointerEventHandlersWithLifecycle<
  T = EmbedPdfPointerEvent,
> extends PointerEventHandlers<T> {
  onHandlerActiveStart?(modeId: string): void;
  onHandlerActiveEnd?(modeId: string): void;
}

interface GlobalInteractionScope {
  type: 'global';
  documentId: string;
}

interface PageInteractionScope {
  type: 'page';
  documentId: string;
  pageIndex: number;
}

export type InteractionScope = GlobalInteractionScope | PageInteractionScope;

export interface RegisterHandlersOptions {
  /** the document these handlers belong to */
  documentId: string;
  /** the mode the handlers belong to */
  modeId: string | string[];
  /** callbacks */
  handlers: PointerEventHandlersWithLifecycle;
  /** if omitted ⇒ handlers listen on the *global* layer */
  pageIndex?: number;
}

export interface RegisterAlwaysOptions {
  scope: InteractionScope;
  handlers: PointerEventHandlersWithLifecycle;
}

// Events include documentId
export interface ModeChangeEvent {
  documentId: string;
  activeMode: string;
  previousMode: string;
}

export interface CursorChangeEvent {
  documentId: string;
  cursor: string;
}

export interface StateChangeEvent {
  documentId: string;
  state: InteractionDocumentState;
}

// Scoped interaction capability
export interface InteractionManagerScope {
  getActiveMode(): string;
  getActiveInteractionMode(): InteractionMode | null;
  activate(modeId: string): void;
  activateDefaultMode(): void;
  setCursor(token: string, cursor: string, priority?: number): void;
  getCurrentCursor(): string;
  removeCursor(token: string): void;
  getHandlersForScope(scope: InteractionScope): PointerEventHandlers | null;
  activeModeIsExclusive(): boolean;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  getState(): InteractionDocumentState;
  onModeChange: EventHook<string>;
  onCursorChange: EventHook<string>;
  onStateChange: EventHook<InteractionDocumentState>;
}

export interface InteractionManagerCapability {
  // Active document operations
  getActiveMode(): string;
  getActiveInteractionMode(): InteractionMode | null;
  activate(modeId: string): void;
  activateDefaultMode(): void;
  setCursor(token: string, cursor: string, priority?: number): void;
  getCurrentCursor(): string;
  removeCursor(token: string): void;
  getHandlersForScope(scope: InteractionScope): PointerEventHandlers | null;
  activeModeIsExclusive(): boolean;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  getState(): InteractionDocumentState;

  // Document-scoped operations
  forDocument(documentId: string): InteractionManagerScope;

  // Global mode & exclusion management
  registerMode(mode: InteractionMode): void;
  registerHandlers(options: RegisterHandlersOptions): () => void;
  registerAlways(options: RegisterAlwaysOptions): () => void;
  setDefaultMode(id: string): void;
  getDefaultMode(): string;
  getExclusionRules(): InteractionExclusionRules;
  setExclusionRules(rules: InteractionExclusionRules): void;
  addExclusionClass(className: string): void;
  removeExclusionClass(className: string): void;
  addExclusionAttribute(attribute: string): void;
  removeExclusionAttribute(attribute: string): void;

  // Events (all include documentId)
  onModeChange: EventHook<ModeChangeEvent>;
  onCursorChange: EventHook<CursorChangeEvent>;
  onHandlerChange: EventHook<InteractionManagerState>;
  onStateChange: EventHook<StateChangeEvent>;
}
