import { IPlugin } from '../types/plugin';
import { PluginRegistry } from '../registry/plugin-registry';
import {
  Action,
  CLOSE_DOCUMENT,
  CoreAction,
  CoreState,
  PluginStore,
  SET_ACTIVE_DOCUMENT,
  SET_DOCUMENT_LOADED,
  SET_ROTATION,
  SET_SCALE,
  START_LOADING_DOCUMENT,
  Store,
  StoreState,
} from '../store';
import { Logger, PdfEngine } from '@embedpdf/models';
import { DocumentState } from '../store/initial-state';

export interface StateChangeHandler<TState> {
  (state: TState): void;
}

export abstract class BasePlugin<
  TConfig = unknown,
  TCapability = unknown,
  TState = unknown,
  TAction extends Action = Action,
> implements IPlugin<TConfig>
{
  static readonly id: string;

  protected pluginStore: PluginStore<TState, TAction>;
  protected coreStore: Store<CoreState, CoreAction>;
  protected readonly logger: Logger;
  protected readonly engine: PdfEngine;

  // Track cooldown actions (renamed from debouncedActions)
  private cooldownActions: Record<string, number> = {};
  private debouncedTimeouts: Record<string, number> = {};
  private unsubscribeFromState: (() => void) | null = null;
  private unsubscribeFromCoreStore: (() => void) | null = null;
  private unsubscribeFromStartLoadingDocument: (() => void) | null = null;
  private unsubscribeFromSetDocumentLoaded: (() => void) | null = null;
  private unsubscribeFromCloseDocument: (() => void) | null = null;
  private unsubscribeFromSetScale: (() => void) | null = null;
  private unsubscribeFromSetRotation: (() => void) | null = null;

  private _capability?: Readonly<TCapability>;

  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  constructor(
    public readonly id: string,
    protected registry: PluginRegistry,
  ) {
    if (id !== (this.constructor as typeof BasePlugin).id) {
      throw new Error(
        `Plugin ID mismatch: ${id} !== ${(this.constructor as typeof BasePlugin).id}`,
      );
    }
    this.engine = this.registry.getEngine();
    this.logger = this.registry.getLogger();
    this.coreStore = this.registry.getStore();
    this.pluginStore = this.coreStore.getPluginStore<TState, TAction>(this.id);
    this.unsubscribeFromState = this.pluginStore.subscribeToState((action, newState, oldState) => {
      this.onStoreUpdated(oldState, newState);
    });
    this.unsubscribeFromCoreStore = this.coreStore.subscribe((action, newState, oldState) => {
      this.onCoreStoreUpdated(oldState, newState);
      if (newState.core.activeDocumentId !== oldState.core.activeDocumentId) {
        this.onActiveDocumentChanged(
          oldState.core.activeDocumentId,
          newState.core.activeDocumentId,
        );
      }
    });
    this.unsubscribeFromStartLoadingDocument = this.coreStore.onAction(
      START_LOADING_DOCUMENT,
      (action) => {
        this.onDocumentLoadingStarted(action.payload.documentId);
      },
    );
    this.unsubscribeFromSetDocumentLoaded = this.coreStore.onAction(
      SET_DOCUMENT_LOADED,
      (action) => {
        this.onDocumentLoaded(action.payload.documentId);
      },
    );
    this.unsubscribeFromCloseDocument = this.coreStore.onAction(CLOSE_DOCUMENT, (action) => {
      this.onDocumentClosed(action.payload.documentId);
    });
    this.unsubscribeFromSetScale = this.coreStore.onAction(SET_SCALE, (action, state) => {
      const targetId = action.payload.documentId ?? state.core.activeDocumentId;
      if (targetId) {
        this.onScaleChanged(targetId, action.payload.scale);
      }
    });
    this.unsubscribeFromSetRotation = this.coreStore.onAction(SET_ROTATION, (action, state) => {
      const targetId = action.payload.documentId ?? state.core.activeDocumentId;
      if (targetId) {
        this.onRotationChanged(targetId, action.payload.rotation);
      }
    });

    // Initialize ready state
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    // By default, plugins are ready immediately
    this.readyResolve();
  }

  /** Construct the public capability (called once & cached). */
  protected abstract buildCapability(): TCapability;

  public provides(): Readonly<TCapability> {
    if (!this._capability) {
      const cap = this.buildCapability();

      this._capability = Object.freeze(cap);
    }
    return this._capability;
  }

  /**
   * Initialize plugin with config
   */
  abstract initialize(config: TConfig): Promise<void>;

  /**
   *  Get a copy of the current state
   */
  protected get state(): Readonly<TState> {
    return this.pluginStore.getState();
  }

  /**
   *  Get a copy of the current core state
   */
  protected get coreState(): Readonly<StoreState<CoreState>> {
    return this.coreStore.getState();
  }

  /**
   * @deprecated  use `this.state` Get a copy of the current state
   */
  protected getState(): TState {
    return this.pluginStore.getState();
  }

  /**
   * @deprecated  use `this.coreState` Get a copy of the current core state
   */
  protected getCoreState(): StoreState<CoreState> {
    return this.coreStore.getState();
  }

  /**
   * Core Dispatch
   */
  protected dispatchCoreAction(action: CoreAction): StoreState<CoreState> {
    return this.coreStore.dispatchToCore(action);
  }

  /**
   * Dispatch an action to all plugins
   */
  protected dispatchToAllPlugins(action: TAction): StoreState<CoreState> {
    return this.coreStore.dispatch(action);
  }

  /**
   * Dispatch an action
   */
  protected dispatch(action: TAction): TState {
    return this.pluginStore.dispatch(action);
  }

  /**
   * Dispatch an action with a cooldown to prevent rapid repeated calls
   * This executes immediately if cooldown has expired, then blocks subsequent calls
   * @param action The action to dispatch
   * @param cooldownTime Time in ms for cooldown (default: 100ms)
   * @returns boolean indicating whether the action was dispatched or blocked
   */
  protected cooldownDispatch(action: TAction, cooldownTime: number = 100): boolean {
    const now = Date.now();
    const lastActionTime = this.cooldownActions[action.type] || 0;

    if (now - lastActionTime >= cooldownTime) {
      this.cooldownActions[action.type] = now;
      this.dispatch(action);
      return true;
    }

    return false;
  }

  /**
   * Dispatch an action with true debouncing - waits for the delay after the last call
   * Each new call resets the timer. Action only executes after no calls for the specified time.
   * @param action The action to dispatch
   * @param debounceTime Time in ms to wait after the last call
   */
  protected debouncedDispatch(action: TAction, debounceTime: number = 100): void {
    const actionKey = action.type;

    // Clear existing timeout
    if (this.debouncedTimeouts[actionKey]) {
      clearTimeout(this.debouncedTimeouts[actionKey]);
    }

    // Set new timeout
    this.debouncedTimeouts[actionKey] = setTimeout(() => {
      this.dispatch(action);
      delete this.debouncedTimeouts[actionKey];
    }, debounceTime) as unknown as number;
  }

  /**
   * Cancel a pending debounced action
   * @param actionType The action type to cancel
   */
  protected cancelDebouncedDispatch(actionType: string): void {
    if (this.debouncedTimeouts[actionType]) {
      clearTimeout(this.debouncedTimeouts[actionType]);
      delete this.debouncedTimeouts[actionType];
    }
  }

  /**
   * Subscribe to state changes
   */
  protected subscribe(listener: (action: TAction, state: TState) => void): () => void {
    return this.pluginStore.subscribeToState(listener);
  }

  /**
   * Subscribe to core store changes
   */
  protected subscribeToCoreStore(
    listener: (action: Action, state: StoreState<CoreState>) => void,
  ): () => void {
    return this.coreStore.subscribe(listener);
  }

  /**
   * Called when the plugin store state is updated
   * @param oldState Previous state
   * @param newState New state
   */
  protected onStoreUpdated(oldState: TState, newState: TState): void {
    // Default implementation does nothing - can be overridden by plugins
  }

  /**
   * Called when the core store state is updated
   * @param oldState Previous state
   * @param newState New state
   */
  protected onCoreStoreUpdated(
    oldState: StoreState<CoreState>,
    newState: StoreState<CoreState>,
  ): void {
    // Default implementation does nothing - can be overridden by plugins
  }

  /**
   * Called when a document is opened
   * Override to initialize per-document state
   * @param documentId The ID of the document that was opened
   */
  protected onDocumentLoadingStarted(documentId: string): void {
    // Default: no-op
  }

  /**
   * Called when a document is loaded
   * @param documentId The ID of the document that is loaded
   */
  protected onDocumentLoaded(documentId: string): void {
    // Default: no-op
  }

  /**
   * Called when a document is closed
   * Override to cleanup per-document state
   * @param documentId The ID of the document that was closed
   */
  protected onDocumentClosed(documentId: string): void {
    // Default: no-op
  }

  /**
   * Called when the active document changes
   * @param previousId The ID of the previous active document
   * @param currentId The ID of the new active document
   */
  protected onActiveDocumentChanged(previousId: string | null, currentId: string | null): void {
    // Default: no-op
  }

  protected onScaleChanged(documentId: string, scale: number): void {
    // Default: no-op
  }

  protected onRotationChanged(documentId: string, rotation: number): void {
    // Default: no-op
  }

  /**
   * Cleanup method to be called when plugin is being destroyed
   */
  public destroy(): void {
    // Clear all pending timeouts
    Object.values(this.debouncedTimeouts).forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.debouncedTimeouts = {};

    if (this.unsubscribeFromState) {
      this.unsubscribeFromState();
      this.unsubscribeFromState = null;
    }
    if (this.unsubscribeFromCoreStore) {
      this.unsubscribeFromCoreStore();
      this.unsubscribeFromCoreStore = null;
    }
    if (this.unsubscribeFromStartLoadingDocument) {
      this.unsubscribeFromStartLoadingDocument();
      this.unsubscribeFromStartLoadingDocument = null;
    }
    if (this.unsubscribeFromSetDocumentLoaded) {
      this.unsubscribeFromSetDocumentLoaded();
      this.unsubscribeFromSetDocumentLoaded = null;
    }
    if (this.unsubscribeFromCloseDocument) {
      this.unsubscribeFromCloseDocument();
      this.unsubscribeFromCloseDocument = null;
    }
    if (this.unsubscribeFromSetScale) {
      this.unsubscribeFromSetScale();
      this.unsubscribeFromSetScale = null;
    }
    if (this.unsubscribeFromSetRotation) {
      this.unsubscribeFromSetRotation();
      this.unsubscribeFromSetRotation = null;
    }
  }

  /**
   * Returns a promise that resolves when the plugin is ready
   */
  public ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Mark the plugin as ready
   */
  protected markReady(): void {
    this.readyResolve();
  }

  /**
   * Reset the ready state (useful for plugins that need to reinitialize)
   */
  protected resetReady(): void {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Get the active document ID
   * @throws Error if no active document exists
   */
  protected getActiveDocumentId(): string {
    const id = this.coreState.core.activeDocumentId;
    if (!id) {
      throw new Error('No active document');
    }
    return id;
  }

  /**
   * Get the active document ID or null if none exists
   */
  protected getActiveDocumentIdOrNull(): string | null {
    return this.coreState.core.activeDocumentId;
  }

  /**
   * Get core document state for a specific document
   * @param documentId Document ID (optional, defaults to active document)
   * @returns Document state or null if not found
   */
  protected getCoreDocument(documentId?: string): DocumentState | null {
    const id = documentId ?? this.getActiveDocumentIdOrNull();
    if (!id) return null;
    return this.coreState.core.documents[id] ?? null;
  }

  /**
   * Get core document state for a specific document
   * @param documentId Document ID (optional, defaults to active document)
   * @throws Error if document not found
   */
  protected getCoreDocumentOrThrow(documentId?: string): DocumentState {
    const doc = this.getCoreDocument(documentId);
    if (!doc) {
      throw new Error(`Document not found: ${documentId ?? 'active'}`);
    }
    return doc;
  }
}
