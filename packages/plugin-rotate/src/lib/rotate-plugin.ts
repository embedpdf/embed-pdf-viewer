import {
  BasePlugin,
  createBehaviorEmitter,
  Listener,
  PluginRegistry,
  setRotation as setCoreRotation,
} from '@embedpdf/core';
import { Rotation } from '@embedpdf/models';
import {
  GetMatrixOptions,
  RotateCapability,
  RotatePluginConfig,
  RotateScope,
  RotationChangeEvent,
  RotateState,
  RotateDocumentState,
} from './types';
import { getNextRotation, getPreviousRotation, getRotationMatrixString } from './utils';
import { initRotateState, cleanupRotateState, setRotation, RotateAction } from './actions';

export class RotatePlugin extends BasePlugin<
  RotatePluginConfig,
  RotateCapability,
  RotateState,
  RotateAction
> {
  static readonly id = 'rotate' as const;

  private readonly rotate$ = createBehaviorEmitter<RotationChangeEvent>();
  private readonly defaultRotation: Rotation;

  constructor(id: string, registry: PluginRegistry, cfg: RotatePluginConfig) {
    super(id, registry);
    this.defaultRotation = cfg.defaultRotation ?? 0;
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize rotation state for this document
    const docState: RotateDocumentState = {
      rotation: this.defaultRotation,
    };

    this.dispatch(initRotateState(documentId, docState));

    // Also set in core state for backwards compatibility
    this.dispatchCoreAction(setCoreRotation(this.defaultRotation, documentId));

    this.logger.debug(
      'RotatePlugin',
      'DocumentOpened',
      `Initialized rotation state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupRotateState(documentId));

    this.logger.debug(
      'RotatePlugin',
      'DocumentClosed',
      `Cleaned up rotation state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): RotateCapability {
    return {
      // Active document operations
      setRotation: (rotation: Rotation) => this.setRotationForDocument(rotation),
      getRotation: () => this.getRotationForDocument(),
      rotateForward: () => this.rotateForward(),
      rotateBackward: () => this.rotateBackward(),
      getMatrixAsString: (options: GetMatrixOptions) => this.getMatrixAsString(options),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createRotateScope(documentId),

      // Events
      onRotateChange: this.rotate$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createRotateScope(documentId: string): RotateScope {
    return {
      setRotation: (rotation: Rotation) => this.setRotationForDocument(rotation, documentId),
      getRotation: () => this.getRotationForDocument(documentId),
      rotateForward: () => this.rotateForward(documentId),
      rotateBackward: () => this.rotateBackward(documentId),
      getMatrixAsString: (options: GetMatrixOptions) => this.getMatrixAsString(options, documentId),
      onRotateChange: (listener: Listener<Rotation>) =>
        this.rotate$.on((event) => {
          if (event.documentId === documentId) listener(event.rotation);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────
  private getDocumentState(documentId?: string): RotateDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): RotateDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Rotation state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private setRotationForDocument(rotation: Rotation, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.coreState.core.documents[id];

    if (!coreDoc?.document) {
      throw new Error(`Document ${id} not loaded`);
    }

    // Update plugin state
    this.dispatch(setRotation(id, rotation));

    // Update core state for backwards compatibility
    this.dispatchCoreAction(setCoreRotation(rotation, id));

    // Emit event
    this.rotate$.emit({
      documentId: id,
      rotation,
    });
  }

  private getRotationForDocument(documentId?: string): Rotation {
    return this.getDocumentStateOrThrow(documentId).rotation;
  }

  private rotateForward(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const currentRotation = this.getRotationForDocument(id);
    const nextRotation = getNextRotation(currentRotation);
    this.setRotationForDocument(nextRotation, id);
  }

  private rotateBackward(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const currentRotation = this.getRotationForDocument(id);
    const prevRotation = getPreviousRotation(currentRotation);
    this.setRotationForDocument(prevRotation, id);
  }

  public getMatrixAsString(options: GetMatrixOptions, documentId?: string): string {
    const rotation = this.getRotationForDocument(documentId);
    return getRotationMatrixString(rotation, options.w, options.h);
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: RotateState, newState: RotateState): void {
    // Emit rotation change events for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (prevDoc?.rotation !== newDoc.rotation) {
        this.logger.debug(
          'RotatePlugin',
          'RotationChanged',
          `Rotation changed for document ${documentId}: ${prevDoc?.rotation ?? 0} -> ${newDoc.rotation}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_config: RotatePluginConfig): Promise<void> {
    this.logger.info('RotatePlugin', 'Initialize', 'Rotate plugin initialized');
  }

  async destroy(): Promise<void> {
    this.rotate$.clear();
    super.destroy();
  }
}
