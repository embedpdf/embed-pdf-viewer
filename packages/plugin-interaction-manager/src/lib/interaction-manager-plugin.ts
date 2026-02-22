import {
  BasePlugin,
  createBehaviorEmitter,
  createEmitter,
  Listener,
  PluginRegistry,
} from '@embedpdf/core';

import {
  InteractionExclusionRules,
  InteractionManagerCapability,
  InteractionManagerPluginConfig,
  InteractionManagerState,
  InteractionMode,
  InteractionScope,
  PointerEventHandlers,
  PointerEventHandlersWithLifecycle,
  RegisterAlwaysOptions,
  RegisterHandlersOptions,
  ModeChangeEvent,
  CursorChangeEvent,
  StateChangeEvent,
  PageActivityChangeEvent,
  InteractionDocumentState,
  InteractionManagerScope,
} from './types';
import {
  activateMode,
  addExclusionAttribute,
  addExclusionClass,
  cleanupInteractionState,
  initInteractionState,
  pauseInteraction,
  removeExclusionAttribute,
  removeExclusionClass,
  resumeInteraction,
  setCursor,
  setDefaultMode,
  setExclusionRules,
  InteractionManagerAction,
} from './actions';
import { mergeHandlers } from './helper';

interface CursorClaim {
  cursor: string;
  priority: number;
}

type HandlerSet = Set<PointerEventHandlersWithLifecycle>;
type PageHandlerMap = Map<number /*pageIdx*/, HandlerSet>;

interface ModeBuckets {
  /** handlers that listen on the global wrapper */
  global: HandlerSet;
  /** handlers that listen on a specific page wrapper */
  page: PageHandlerMap;
}

const INITIAL_MODE = 'pointerMode';

export class InteractionManagerPlugin extends BasePlugin<
  InteractionManagerPluginConfig,
  InteractionManagerCapability,
  InteractionManagerState,
  InteractionManagerAction
> {
  static readonly id = 'interaction-manager' as const;

  // Global mode definitions (shared across documents)
  private modes = new Map<string, InteractionMode>();

  // Per-document cursor claims: documentId -> token -> claim
  private cursorClaims = new Map<string, Map<string, CursorClaim>>();

  // Per-document handler buckets: documentId -> modeId -> buckets
  private buckets = new Map<string, Map<string, ModeBuckets>>();

  // Per-document always-active handlers
  private alwaysGlobal = new Map<string, Set<PointerEventHandlersWithLifecycle>>();
  private alwaysPage = new Map<string, Map<number, Set<PointerEventHandlersWithLifecycle>>>();

  // Per-document page activities: documentId -> Map<topic, pageIndex>
  private pageActivities = new Map<string, Map<string, number>>();

  // Event emitters
  private readonly onModeChange$ = createEmitter<ModeChangeEvent>();
  private readonly onHandlerChange$ = createEmitter<InteractionManagerState>();
  private readonly onCursorChange$ = createEmitter<CursorChangeEvent>();
  private readonly onStateChange$ = createBehaviorEmitter<StateChangeEvent>();
  private readonly onPageActivityChange$ = createEmitter<PageActivityChangeEvent>();

  constructor(id: string, registry: PluginRegistry, config: InteractionManagerPluginConfig) {
    super(id, registry);

    // Register default mode globally
    this.registerMode({
      id: INITIAL_MODE,
      scope: 'page',
      exclusive: false,
      cursor: 'auto',
    });

    this.dispatch(setDefaultMode(INITIAL_MODE));
    if (config.exclusionRules) {
      this.dispatch(setExclusionRules(config.exclusionRules));
    }
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize interaction state for this document
    const docState: InteractionDocumentState = {
      activeMode: this.state.defaultMode,
      cursor: 'auto',
      paused: false,
    };

    this.dispatch(initInteractionState(documentId, docState));

    // Initialize per-document data structures
    this.cursorClaims.set(documentId, new Map());
    this.buckets.set(documentId, new Map());
    this.alwaysGlobal.set(documentId, new Set());
    this.alwaysPage.set(documentId, new Map());
    this.pageActivities.set(documentId, new Map());

    // Initialize buckets for all registered modes
    const docBuckets = this.buckets.get(documentId)!;
    for (const modeId of this.modes.keys()) {
      docBuckets.set(modeId, { global: new Set(), page: new Map() });
    }

    this.logger.debug(
      'InteractionManagerPlugin',
      'DocumentOpened',
      `Initialized interaction state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Emit release events for any remaining page activities
    const topics = this.pageActivities.get(documentId);
    if (topics) {
      // Collect unique pages that have topics
      const activePages = new Set(topics.values());
      topics.clear();
      for (const pageIndex of activePages) {
        this.onPageActivityChange$.emit({ documentId, pageIndex, hasActivity: false });
      }
    }

    // Cleanup per-document data structures
    this.cursorClaims.delete(documentId);
    this.buckets.delete(documentId);
    this.alwaysGlobal.delete(documentId);
    this.alwaysPage.delete(documentId);
    this.pageActivities.delete(documentId);

    // Cleanup state
    this.dispatch(cleanupInteractionState(documentId));

    this.logger.debug(
      'InteractionManagerPlugin',
      'DocumentClosed',
      `Cleaned up interaction state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): InteractionManagerCapability {
    return {
      // Active document operations
      getActiveMode: () => this.getActiveMode(),
      getActiveInteractionMode: () => this.getActiveInteractionMode(),
      activate: (modeId: string) => this.activate(modeId),
      activateDefaultMode: () => this.activateDefaultMode(),
      setCursor: (token: string, cursor: string, priority?: number) =>
        this.setCursor(token, cursor, priority),
      getCurrentCursor: () => this.getCurrentCursor(),
      removeCursor: (token: string) => this.removeCursor(token),
      getHandlersForScope: (scope: InteractionScope) => this.getHandlersForScope(scope),
      activeModeIsExclusive: () => this.activeModeIsExclusive(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      // Treat a destroyed registry as "paused" so late DOM events are ignored during teardown.
      isPaused: () => this.registry.isDestroyed() || this.isPaused(),
      getState: () => this.getDocumentStateOrThrow(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createInteractionScope(documentId),

      // Global management
      registerMode: (mode: InteractionMode) => this.registerMode(mode),
      registerHandlers: (options: RegisterHandlersOptions) => this.registerHandlers(options),
      registerAlways: (options: RegisterAlwaysOptions) => this.registerAlways(options),
      setDefaultMode: (id: string) => this.setDefaultMode(id),
      getDefaultMode: () => this.state.defaultMode,
      getExclusionRules: () => this.state.exclusionRules,
      setExclusionRules: (rules: InteractionExclusionRules) =>
        this.dispatch(setExclusionRules(rules)),
      addExclusionClass: (className: string) => this.dispatch(addExclusionClass(className)),
      removeExclusionClass: (className: string) => this.dispatch(removeExclusionClass(className)),
      addExclusionAttribute: (attribute: string) => this.dispatch(addExclusionAttribute(attribute)),
      removeExclusionAttribute: (attribute: string) =>
        this.dispatch(removeExclusionAttribute(attribute)),

      // Page activity
      claimPageActivity: (documentId: string, topic: string, pageIndex: number) =>
        this.claimPageActivity(documentId, topic, pageIndex),
      releasePageActivity: (documentId: string, topic: string) =>
        this.releasePageActivity(documentId, topic),
      hasPageActivity: (documentId: string, pageIndex: number) =>
        this.hasPageActivity(documentId, pageIndex),

      // Events
      onModeChange: this.onModeChange$.on,
      onCursorChange: this.onCursorChange$.on,
      onHandlerChange: this.onHandlerChange$.on,
      onStateChange: this.onStateChange$.on,
      onPageActivityChange: this.onPageActivityChange$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createInteractionScope(documentId: string): InteractionManagerScope {
    return {
      getActiveMode: () => this.getActiveMode(documentId),
      getActiveInteractionMode: () => this.getActiveInteractionMode(documentId),
      activate: (modeId: string) => this.activate(modeId, documentId),
      activateDefaultMode: () => this.activateDefaultMode(documentId),
      setCursor: (token: string, cursor: string, priority?: number) =>
        this.setCursor(token, cursor, priority, documentId),
      getCurrentCursor: () => this.getCurrentCursor(documentId),
      removeCursor: (token: string) => this.removeCursor(token, documentId),
      getHandlersForScope: (scope: InteractionScope) => this.getHandlersForScope(scope),
      activeModeIsExclusive: () => this.activeModeIsExclusive(documentId),
      pause: () => this.pause(documentId),
      resume: () => this.resume(documentId),
      isPaused: () => this.isPaused(documentId),
      getState: () => this.getDocumentStateOrThrow(documentId),
      claimPageActivity: (topic: string, pageIndex: number) =>
        this.claimPageActivity(documentId, topic, pageIndex),
      releasePageActivity: (topic: string) => this.releasePageActivity(documentId, topic),
      hasPageActivity: (pageIndex: number) => this.hasPageActivity(documentId, pageIndex),
      onModeChange: (listener: Listener<string>) =>
        this.onModeChange$.on((event) => {
          if (event.documentId === documentId) listener(event.activeMode);
        }),
      onCursorChange: (listener: Listener<string>) =>
        this.onCursorChange$.on((event) => {
          if (event.documentId === documentId) listener(event.cursor);
        }),
      onStateChange: (listener: Listener<InteractionDocumentState>) =>
        this.onStateChange$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
      onPageActivityChange: (listener: Listener<{ pageIndex: number; hasActivity: boolean }>) =>
        this.onPageActivityChange$.on((event) => {
          if (event.documentId === documentId)
            listener({ pageIndex: event.pageIndex, hasActivity: event.hasActivity });
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getDocumentState(documentId?: string): InteractionDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): InteractionDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Interaction state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private activate(modeId: string, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);

    if (!this.modes.has(modeId)) {
      throw new Error(`[interaction] unknown mode '${modeId}'`);
    }
    if (modeId === docState.activeMode) return;

    const previousMode = docState.activeMode;

    // Clear cursor claims for this document
    this.cursorClaims.get(id)?.clear();

    // Notify handlers going inactive
    this.notifyHandlersInactive(id, previousMode);

    // Update state
    this.dispatch(activateMode(id, modeId));

    // Emit cursor
    this.emitCursor(id);

    // Notify handlers going active
    this.notifyHandlersActive(id, modeId);

    // Emit mode change event
    this.onModeChange$.emit({
      documentId: id,
      activeMode: modeId,
      previousMode,
    });
  }

  private activateDefaultMode(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentIdOrNull();
    if (!id) return;
    this.activate(this.state.defaultMode, id);
  }

  private setDefaultMode(modeId: string) {
    if (!this.modes.has(modeId)) {
      throw new Error(`[interaction] cannot set unknown mode '${modeId}' as default`);
    }
    this.dispatch(setDefaultMode(modeId));
  }

  private getActiveMode(documentId?: string): string {
    return this.getDocumentStateOrThrow(documentId).activeMode;
  }

  private getActiveInteractionMode(documentId?: string): InteractionMode | null {
    const docState = this.getDocumentState(documentId);
    if (!docState) return null;
    return this.modes.get(docState.activeMode) ?? null;
  }

  private activeModeIsExclusive(documentId?: string): boolean {
    const mode = this.getActiveInteractionMode(documentId);
    return !!mode?.exclusive;
  }

  private pause(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(pauseInteraction(id));
  }

  private resume(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(resumeInteraction(id));
  }

  private isPaused(documentId?: string): boolean {
    return this.getDocumentStateOrThrow(documentId).paused;
  }

  // ─────────────────────────────────────────────────────────
  // Mode Management
  // ─────────────────────────────────────────────────────────

  private registerMode(mode: InteractionMode) {
    this.modes.set(mode.id, mode);

    // Add buckets for this mode in all existing documents
    for (const documentId of this.buckets.keys()) {
      const docBuckets = this.buckets.get(documentId)!;
      if (!docBuckets.has(mode.id)) {
        docBuckets.set(mode.id, { global: new Set(), page: new Map() });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Handler Management
  // ─────────────────────────────────────────────────────────

  private registerHandlers({
    documentId,
    modeId,
    handlers,
    pageIndex,
  }: RegisterHandlersOptions): () => void {
    const modeIds = Array.isArray(modeId) ? modeId : [modeId];
    const cleanupFunctions: (() => void)[] = [];

    const docBuckets = this.buckets.get(documentId);
    if (!docBuckets) {
      throw new Error(`No buckets found for document: ${documentId}`);
    }

    for (const id of modeIds) {
      const bucket = docBuckets.get(id);
      if (!bucket) throw new Error(`unknown mode '${id}'`);

      if (pageIndex == null) {
        bucket.global.add(handlers);
      } else {
        const set = bucket.page.get(pageIndex) ?? new Set();
        set.add(handlers);
        bucket.page.set(pageIndex, set);
      }

      cleanupFunctions.push(() => {
        if (pageIndex == null) {
          bucket.global.delete(handlers);
        } else {
          const set = bucket.page.get(pageIndex);
          if (set) {
            set.delete(handlers);
            if (set.size === 0) {
              bucket.page.delete(pageIndex);
            }
          }
        }
      });
    }

    this.onHandlerChange$.emit({ ...this.state });

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
      this.onHandlerChange$.emit({ ...this.state });
    };
  }

  public registerAlways({ scope, handlers }: RegisterAlwaysOptions): () => void {
    if (scope.type === 'global') {
      const set = this.alwaysGlobal.get(scope.documentId) ?? new Set();
      set.add(handlers);
      this.alwaysGlobal.set(scope.documentId, set);
      this.onHandlerChange$.emit({ ...this.state });
      return () => {
        set.delete(handlers);
        this.onHandlerChange$.emit({ ...this.state });
      };
    }

    const docPageMap = this.alwaysPage.get(scope.documentId) ?? new Map();
    const set = docPageMap.get(scope.pageIndex) ?? new Set();
    set.add(handlers);
    docPageMap.set(scope.pageIndex, set);
    this.alwaysPage.set(scope.documentId, docPageMap);
    this.onHandlerChange$.emit({ ...this.state });
    return () => {
      set.delete(handlers);
      this.onHandlerChange$.emit({ ...this.state });
    };
  }

  private getHandlersForScope(scope: InteractionScope): PointerEventHandlers | null {
    const docState = this.getDocumentState(scope.documentId);
    if (!docState) return null;

    const mode = this.modes.get(docState.activeMode);
    if (!mode) return null;

    const docBuckets = this.buckets.get(scope.documentId);
    if (!docBuckets) return null;

    const bucket = docBuckets.get(mode.id);
    if (!bucket) return null;

    const mergeSets = (a: HandlerSet, b: HandlerSet) =>
      a.size || b.size ? mergeHandlers([...a, ...b]) : null;

    if (scope.type === 'global') {
      const alwaysSet = this.alwaysGlobal.get(scope.documentId) ?? new Set<PointerEventHandlers>();
      const modeSpecific =
        mode.scope === 'global' ? bucket.global : new Set<PointerEventHandlers>();
      return mergeSets(alwaysSet, modeSpecific);
    }

    const alwaysPageSet =
      this.alwaysPage.get(scope.documentId)?.get(scope.pageIndex) ??
      new Set<PointerEventHandlers>();
    const modePageSet =
      mode.scope === 'page'
        ? (bucket.page.get(scope.pageIndex) ?? new Set<PointerEventHandlers>())
        : new Set<PointerEventHandlers>();

    return mergeSets(alwaysPageSet, modePageSet);
  }

  // ─────────────────────────────────────────────────────────
  // Cursor Management
  // ─────────────────────────────────────────────────────────

  private setCursor(token: string, cursor: string, priority = 0, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const claims = this.cursorClaims.get(id);
    if (!claims) return;

    claims.set(token, { cursor, priority });
    this.emitCursor(id);
  }

  private removeCursor(token: string, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const claims = this.cursorClaims.get(id);
    if (!claims) return;

    claims.delete(token);
    this.emitCursor(id);
  }

  private getCurrentCursor(documentId?: string): string {
    return this.getDocumentStateOrThrow(documentId).cursor;
  }

  private emitCursor(documentId: string) {
    const claims = this.cursorClaims.get(documentId);
    if (!claims) return;

    const docState = this.getDocumentState(documentId);
    if (!docState) return;

    const top = [...claims.values()].sort((a, b) => b.priority - a.priority)[0] ?? {
      cursor: this.modes.get(docState.activeMode)?.cursor ?? 'auto',
    };

    if (top.cursor !== docState.cursor) {
      this.dispatch(setCursor(documentId, top.cursor));
      this.onCursorChange$.emit({
        documentId,
        cursor: top.cursor,
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Page Activity Management
  // ─────────────────────────────────────────────────────────

  private claimPageActivity(documentId: string, topic: string, pageIndex: number): void {
    let topics = this.pageActivities.get(documentId);
    if (!topics) {
      topics = new Map();
      this.pageActivities.set(documentId, topics);
    }

    const oldPage = topics.get(topic);

    // No-op if already on the same page
    if (oldPage === pageIndex) return;

    // Set new page
    topics.set(topic, pageIndex);

    // Release old page if it existed and now has no topics
    if (oldPage !== undefined && !this.pageHasAnyTopic(documentId, oldPage)) {
      this.onPageActivityChange$.emit({ documentId, pageIndex: oldPage, hasActivity: false });
    }

    // Emit for new page if it just gained its first topic
    if (this.countTopicsOnPage(documentId, pageIndex) === 1) {
      this.onPageActivityChange$.emit({ documentId, pageIndex, hasActivity: true });
    }
  }

  private releasePageActivity(documentId: string, topic: string): void {
    const topics = this.pageActivities.get(documentId);
    if (!topics) return;

    const page = topics.get(topic);
    if (page === undefined) return;

    topics.delete(topic);

    // If page has no more topics, emit
    if (!this.pageHasAnyTopic(documentId, page)) {
      this.onPageActivityChange$.emit({ documentId, pageIndex: page, hasActivity: false });
    }
  }

  private hasPageActivity(documentId: string, pageIndex: number): boolean {
    return this.pageHasAnyTopic(documentId, pageIndex);
  }

  /** Helper: does any topic point to this page? */
  private pageHasAnyTopic(documentId: string, pageIndex: number): boolean {
    const topics = this.pageActivities.get(documentId);
    if (!topics) return false;
    for (const p of topics.values()) {
      if (p === pageIndex) return true;
    }
    return false;
  }

  /** Helper: count topics on a page */
  private countTopicsOnPage(documentId: string, pageIndex: number): number {
    const topics = this.pageActivities.get(documentId);
    if (!topics) return 0;
    let count = 0;
    for (const p of topics.values()) {
      if (p === pageIndex) count++;
    }
    return count;
  }

  // ─────────────────────────────────────────────────────────
  // Handler Lifecycle Notifications
  // ─────────────────────────────────────────────────────────

  private notifyHandlersActive(documentId: string, modeId: string) {
    // Notify always-active handlers
    this.alwaysGlobal.get(documentId)?.forEach((handler) => {
      handler.onHandlerActiveStart?.(modeId);
    });

    this.alwaysPage.get(documentId)?.forEach((handlerSet) => {
      handlerSet.forEach((handler) => {
        handler.onHandlerActiveStart?.(modeId);
      });
    });

    const mode = this.modes.get(modeId);
    if (!mode) return;

    const docBuckets = this.buckets.get(documentId);
    if (!docBuckets) return;

    const bucket = docBuckets.get(modeId);
    if (!bucket) return;

    if (mode.scope === 'global') {
      bucket.global.forEach((handler) => {
        handler.onHandlerActiveStart?.(modeId);
      });
    }

    if (mode.scope === 'page') {
      bucket.page.forEach((handlerSet) => {
        handlerSet.forEach((handler) => {
          handler.onHandlerActiveStart?.(modeId);
        });
      });
    }
  }

  private notifyHandlersInactive(documentId: string, modeId: string) {
    // Notify always-active handlers
    this.alwaysGlobal.get(documentId)?.forEach((handler) => {
      handler.onHandlerActiveEnd?.(modeId);
    });

    this.alwaysPage.get(documentId)?.forEach((handlerSet) => {
      handlerSet.forEach((handler) => {
        handler.onHandlerActiveEnd?.(modeId);
      });
    });

    const mode = this.modes.get(modeId);
    if (!mode) return;

    const docBuckets = this.buckets.get(documentId);
    if (!docBuckets) return;

    const bucket = docBuckets.get(modeId);
    if (!bucket) return;

    if (mode.scope === 'global') {
      bucket.global.forEach((handler) => {
        handler.onHandlerActiveEnd?.(modeId);
      });
    }

    if (mode.scope === 'page') {
      bucket.page.forEach((handlerSet) => {
        handlerSet.forEach((handler) => {
          handler.onHandlerActiveEnd?.(modeId);
        });
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(
    prevState: InteractionManagerState,
    newState: InteractionManagerState,
  ): void {
    // Emit state changes for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (prevDoc !== newDoc) {
        this.onStateChange$.emit({
          documentId,
          state: newDoc,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_: InteractionManagerPluginConfig): Promise<void> {
    this.logger.info(
      'InteractionManagerPlugin',
      'Initialize',
      'Interaction Manager Plugin initialized',
    );
  }

  async destroy(): Promise<void> {
    this.pageActivities.clear();
    this.onModeChange$.clear();
    this.onCursorChange$.clear();
    this.onHandlerChange$.clear();
    this.onStateChange$.clear();
    this.onPageActivityChange$.clear();
    await super.destroy();
  }
}
