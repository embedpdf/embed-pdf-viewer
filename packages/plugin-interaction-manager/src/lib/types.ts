import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Position } from '@embedpdf/models';

export interface InteractionManagerPluginConfig extends BasePluginConfig {
  /** Initial exclusion rules */
  exclusionRules?: InteractionExclusionRules;
}

export interface InteractionManagerState {
  /** Mode-id that is currently active (e.g. `"default"` or `"annotationCreation"`). */
  activeMode: string;
  /** Cursor that is currently active (e.g. `"auto"` or `"pointer"`). */
  cursor: string;
  /** Whether the interaction is paused */
  paused: boolean;
  /** Mode-id that is treated as the resolver’s fall-back (“finish → …”). */
  defaultMode: string;
  /** Exclusion rules for interaction */
  exclusionRules: InteractionExclusionRules;
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
  /** if true the page will receive events through a transparent overlay and no other page‑level
   *  listener gets invoked until the mode finishes. */
  exclusive: boolean;
  /** baseline cursor while the mode is active (before any handler overrides it). */
  cursor?: string;
  /** Set to `false` when this tool wants to disable raw touch events.
   *  Defaults to `true`. */
  wantsRawTouch?: boolean;
}

export interface EmbedPdfPointerEvent {
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: any;
  currentTarget: any;
  setPointerCapture?(): void;
  releasePointerCapture?(): void;
}

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

export interface PointerEventHandlersWithLifecycle<T = EmbedPdfPointerEvent>
  extends PointerEventHandlers<T> {
  onHandlerActiveStart?(modeId: string): void;
  onHandlerActiveEnd?(modeId: string): void;
}

interface GlobalInteractionScope {
  type: 'global';
}

interface PageInteractionScope {
  type: 'page';
  pageIndex: number;
}

export type InteractionScope = GlobalInteractionScope | PageInteractionScope;

export interface RegisterHandlersOptions {
  /** the mode the handlers belong to                     */
  modeId: string | string[];
  /** callbacks                                            */
  handlers: PointerEventHandlersWithLifecycle;
  /** if omitted ⇒ handlers listen on the *global* layer   */
  pageIndex?: number;
}

export interface RegisterAlwaysOptions {
  scope: InteractionScope;
  handlers: PointerEventHandlersWithLifecycle;
}

export interface InteractionManagerCapability {
  /** returns the active mode id */
  getActiveMode(): string;
  /** returns the active interaction mode */
  getActiveInteractionMode(): InteractionMode | null;
  /** programmatically switch to a mode */
  activate(modeId: string): void;
  /** set default mode */
  activateDefaultMode(): void;
  /** register a mode (should be called at start‑up by each plugin/tool). */
  registerMode(mode: InteractionMode): void;
  /** register pointer handlers that run *only* while the given mode is active. */
  registerHandlers(options: RegisterHandlersOptions): () => void;
  /** register pointer handlers that run *always* (even if no mode is active). */
  registerAlways(options: RegisterAlwaysOptions): () => void;
  /** low‑level cursor API. Handlers can claim the cursor with a priority (larger wins). */
  setCursor(token: string, cursor: string, priority?: number): void;
  /** Returns the current cursor */
  getCurrentCursor(): string;
  /** remove a cursor */
  removeCursor(token: string): void;
  /** subscribe to mode changes (so framework layers can raise overlays, etc.) */
  onModeChange: EventHook<InteractionManagerState>;
  /** subscribe to cursor changes */
  onCursorChange: EventHook<string>;
  /** subscribe to handler changes */
  onHandlerChange: EventHook<InteractionManagerState>;
  /** subscribe to state changes */
  onStateChange: EventHook<InteractionManagerState>;
  /** framework helpers -------------------------------------------------------------- */
  /** Returns the *merged* handler set for the current mode + given scope.
   *  Used by the PointerInteractionProvider inside each page / at the root. */
  getHandlersForScope(scope: InteractionScope): PointerEventHandlers | null;
  /** Returns whether the current active mode demands an overlay */
  activeModeIsExclusive(): boolean;
  /** Pause the interaction */
  pause(): void;
  /** Resume the interaction */
  resume(): void;
  /** Returns whether the interaction is paused */
  isPaused(): boolean;
  /** Set the default mode */
  setDefaultMode(id: string): void;
  /** Get the default mode */
  getDefaultMode(): string;
  /** Get current exclusion rules */
  getExclusionRules(): InteractionExclusionRules;
  /** Update exclusion rules */
  setExclusionRules(rules: InteractionExclusionRules): void;
  /** Add a class to exclusion */
  addExclusionClass(className: string): void;
  /** Remove a class from exclusion */
  removeExclusionClass(className: string): void;
  /** Add a data attribute to exclusion */
  addExclusionAttribute(attribute: string): void;
  /** Remove a data attribute from exclusion */
  removeExclusionAttribute(attribute: string): void;
}
