import {
  BasePlugin,
  PluginRegistry,
  createBehaviorEmitter,
  startLoadingDocument,
  setDocumentLoaded,
  setDocumentError,
  retryLoadingDocument,
  closeDocument as closeDocumentAction,
  setActiveDocument as setActiveDocumentAction,
  DocumentState,
  Unsubscribe,
  Listener,
  createEmitter,
} from '@embedpdf/core';
import {
  PdfDocumentObject,
  Task,
  PdfFile,
  PdfFileUrl,
  PdfErrorReason,
  PdfErrorCode,
} from '@embedpdf/models';

import {
  DocumentManagerPluginConfig,
  DocumentManagerState,
  DocumentManagerCapability,
  DocumentChangeEvent,
  DocumentOrderChangeEvent,
  LoadDocumentUrlOptions,
  LoadDocumentBufferOptions,
  RetryOptions,
  DocumentErrorEvent,
} from './types';
import {
  DocumentManagerAction,
  setDocumentOrder,
  addToDocumentOrder,
  removeFromDocumentOrder,
} from './actions';

export class DocumentManagerPlugin extends BasePlugin<
  DocumentManagerPluginConfig,
  DocumentManagerCapability,
  DocumentManagerState,
  DocumentManagerAction
> {
  static readonly id = 'document-manager' as const;

  private readonly documentOpened$ = createBehaviorEmitter<DocumentState>();
  private readonly documentClosed$ = createBehaviorEmitter<string>();
  private readonly activeDocumentChanged$ = createBehaviorEmitter<DocumentChangeEvent>();
  private readonly documentError$ = createBehaviorEmitter<DocumentErrorEvent>();
  private readonly documentOrderChanged$ = createBehaviorEmitter<DocumentOrderChangeEvent>();
  private readonly openFileRequest$ = createEmitter<'open'>();

  private maxDocuments?: number;

  // Store original load options ONLY for documents in error state (for retry)
  private loadOptions = new Map<string, LoadDocumentUrlOptions | LoadDocumentBufferOptions>();

  constructor(
    public readonly id: string,
    registry: PluginRegistry,
    config?: DocumentManagerPluginConfig,
  ) {
    super(id, registry);
    this.maxDocuments = config?.maxDocuments;
  }

  protected buildCapability(): DocumentManagerCapability {
    return {
      // Document lifecycle
      openFileDialog: () => this.openFileRequest$.emit('open'),
      openDocumentUrl: (options) => this.openDocumentUrl(options),
      openDocumentBuffer: (options) => this.openDocumentBuffer(options),
      retryDocument: (documentId, options) => this.retryDocument(documentId, options),
      closeDocument: (documentId) => this.closeDocument(documentId),
      closeAllDocuments: () => this.closeAllDocuments(),

      // Active document control
      setActiveDocument: (documentId) => this.setActiveDocument(documentId),
      getActiveDocumentId: () => this.getActiveDocumentIdOrNull(),
      getActiveDocument: () => this.getActiveDocument(),

      // Tab order management
      getDocumentOrder: () => this.state.documentOrder,
      moveDocument: (documentId, toIndex) => this.moveDocument(documentId, toIndex),
      swapDocuments: (id1, id2) => this.swapDocuments(id1, id2),

      // Queries
      getDocument: (documentId) => this.getDocument(documentId),
      getDocumentState: (documentId) => this.getDocumentState(documentId),
      getOpenDocuments: () => this.getOpenDocuments(),
      isDocumentOpen: (documentId) => this.isDocumentOpen(documentId),
      getDocumentCount: () => this.getDocumentCount(),
      getDocumentIndex: (documentId) => this.getDocumentIndex(documentId),

      // Events
      onDocumentOpened: this.documentOpened$.on,
      onDocumentClosed: this.documentClosed$.on,
      onDocumentError: this.documentError$.on,
      onActiveDocumentChanged: this.activeDocumentChanged$.on,
      onDocumentOrderChanged: this.documentOrderChanged$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(addToDocumentOrder(documentId));

    // Emit order change event so hooks can update
    this.documentOrderChanged$.emit({
      order: this.state.documentOrder,
    });
  }

  protected override onDocumentLoaded(documentId: string): void {
    const docState = this.coreState.core.documents[documentId];
    if (!docState || docState.status !== 'loaded') return;

    // Clean up load options to free memory
    this.loadOptions.delete(documentId);

    // Emit opened event with DocumentState directly
    this.documentOpened$.emit(docState);

    this.logger.info(
      'DocumentManagerPlugin',
      'DocumentOpened',
      `Document ${documentId} opened successfully`,
      { name: docState.name },
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(removeFromDocumentOrder(documentId));

    // Emit order change event so hooks can update
    this.documentOrderChanged$.emit({
      order: this.state.documentOrder,
    });

    // Clean up load options
    this.loadOptions.delete(documentId);

    this.documentClosed$.emit(documentId);

    this.logger.info('DocumentManagerPlugin', 'DocumentClosed', `Document ${documentId} closed`);
  }

  protected override onActiveDocumentChanged(
    previousId: string | null,
    currentId: string | null,
  ): void {
    this.activeDocumentChanged$.emit({
      previousDocumentId: previousId,
      currentDocumentId: currentId,
    });

    this.logger.info(
      'DocumentManagerPlugin',
      'ActiveDocumentChanged',
      `Active document changed from ${previousId} to ${currentId}`,
    );
  }

  public onOpenFileRequest(handler: Listener<'open'>): Unsubscribe {
    return this.openFileRequest$.on(handler);
  }

  // ─────────────────────────────────────────────────────────
  // Document Loading
  // ─────────────────────────────────────────────────────────

  private openDocumentUrl(options: LoadDocumentUrlOptions): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    const limitError = this.checkDocumentLimit();
    if (limitError) {
      task.reject(limitError);
      return task;
    }

    const documentId = options.documentId || this.generateDocumentId();
    const documentName = this.extractNameFromUrl(options.url);

    // Store options for potential retry (will be cleared on success)
    this.loadOptions.set(documentId, options);

    // Immediately create loading state
    this.dispatchCoreAction(
      startLoadingDocument(
        documentId,
        documentName,
        options.scale,
        options.rotation,
        !!options.password,
      ),
    );

    this.logger.info(
      'DocumentManagerPlugin',
      'OpenDocumentUrl',
      `Starting to load document from URL: ${options.url}`,
      { documentId, passwordProvided: !!options.password },
    );

    // Create file object and call engine
    const file: PdfFileUrl = {
      id: documentId,
      url: options.url,
    };
    const engineTask = this.engine.openDocumentUrl(file, {
      password: options.password,
      mode: options.mode,
      headers: options.headers,
    });

    // Handle result
    this.handleLoadTask(documentId, engineTask, task, 'OpenDocumentUrl');

    return task;
  }

  private openDocumentBuffer(options: LoadDocumentBufferOptions): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    const limitError = this.checkDocumentLimit();
    if (limitError) {
      task.reject(limitError);
      return task;
    }

    const documentId = options.documentId || this.generateDocumentId();

    // Store options for potential retry (will be cleared on success)
    this.loadOptions.set(documentId, options);

    // Immediately create loading state
    this.dispatchCoreAction(
      startLoadingDocument(
        documentId,
        options.name,
        options.scale,
        options.rotation,
        !!options.password,
      ),
    );

    this.logger.info(
      'DocumentManagerPlugin',
      'OpenDocumentBuffer',
      `Starting to load document from buffer: ${options.name}`,
      { documentId, passwordProvided: !!options.password },
    );

    // Create file object and call engine
    const file: PdfFile = {
      id: documentId,
      content: options.buffer,
    };
    const engineTask = this.engine.openDocumentBuffer(file, {
      password: options.password,
    });

    // Handle result
    this.handleLoadTask(documentId, engineTask, task, 'OpenDocumentBuffer');

    return task;
  }

  private retryDocument(
    documentId: string,
    retryOptions?: RetryOptions,
  ): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    // Validate retry
    const validation = this.validateRetry(documentId);
    if (!validation.valid) {
      task.reject(validation.error!);
      return task;
    }

    const originalOptions = this.loadOptions.get(documentId)!;

    // Merge retry options (e.g., new password)
    const mergedOptions = {
      ...originalOptions,
      ...(retryOptions?.password && { password: retryOptions.password }),
    };

    // Update stored options
    this.loadOptions.set(documentId, mergedOptions);

    // Set back to loading state
    this.dispatchCoreAction(retryLoadingDocument(documentId, !!retryOptions?.password));

    this.logger.info(
      'DocumentManagerPlugin',
      'RetryDocument',
      `Retrying to load document ${documentId}`,
      { passwordProvided: !!retryOptions?.password },
    );

    // Execute retry based on type
    const engineTask =
      'url' in mergedOptions
        ? this.retryUrlDocument(documentId, mergedOptions)
        : this.retryBufferDocument(documentId, mergedOptions);

    // Handle result
    this.handleLoadTask(documentId, engineTask, task, 'RetryDocument');

    return task;
  }

  private closeDocument(documentId: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const docState = this.getDocumentState(documentId);
    if (!docState) {
      this.logger.warn(
        'DocumentManagerPlugin',
        'CloseDocument',
        `Cannot close document ${documentId}: not found in state`,
      );
      task.resolve();
      return task;
    }

    const nextActiveDocumentId = this.calculateNextActiveDocument(documentId);

    // Only call engine.closeDocument if the document is actually loaded
    // For documents in error/loading state, just clean up the core state
    if (docState.status === 'loaded' && docState.document) {
      this.engine.closeDocument(docState.document).wait(
        () => {
          this.dispatchCoreAction(closeDocumentAction(documentId, nextActiveDocumentId));
          task.resolve();
        },
        (error) => {
          this.logger.error(
            'DocumentManagerPlugin',
            'CloseDocument',
            `Failed to close document ${documentId}`,
            error,
          );
          task.fail(error);
        },
      );
    } else {
      // Document is not loaded (error, loading, etc.), just clean up state
      this.logger.info(
        'DocumentManagerPlugin',
        'CloseDocument',
        `Closing document ${documentId} in ${docState.status} state (skipping engine close)`,
      );
      this.dispatchCoreAction(closeDocumentAction(documentId, nextActiveDocumentId));
      task.resolve();
    }

    return task;
  }

  private closeAllDocuments(): Task<void[], PdfErrorReason> {
    const documentIds = Object.keys(this.coreState.core.documents);
    const tasks = documentIds.map((documentId) => this.closeDocument(documentId));

    this.logger.info(
      'DocumentManagerPlugin',
      'CloseAllDocuments',
      `Closing ${documentIds.length} documents`,
    );

    return Task.all(tasks);
  }

  // ─────────────────────────────────────────────────────────
  // Active Document Control
  // ─────────────────────────────────────────────────────────

  private setActiveDocument(documentId: string): void {
    if (!this.isDocumentOpen(documentId)) {
      throw new Error(`Cannot set active document: ${documentId} is not open`);
    }

    this.dispatchCoreAction(setActiveDocumentAction(documentId));
  }

  private getActiveDocument(): PdfDocumentObject | null {
    const activeId = this.coreState.core.activeDocumentId;
    if (!activeId) return null;

    const docState = this.coreState.core.documents[activeId];
    return docState?.document ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // Tab Order Management
  // ─────────────────────────────────────────────────────────

  private moveDocument(documentId: string, toIndex: number): void {
    const currentOrder = this.state.documentOrder;
    const fromIndex = currentOrder.indexOf(documentId);

    if (fromIndex === -1) {
      throw new Error(`Document ${documentId} not found in order`);
    }

    if (toIndex < 0 || toIndex >= currentOrder.length) {
      throw new Error(`Invalid index ${toIndex}`);
    }

    if (fromIndex === toIndex) return;

    const newOrder = [...currentOrder];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, documentId);

    this.dispatch(setDocumentOrder(newOrder));

    this.documentOrderChanged$.emit({
      order: newOrder,
      movedDocumentId: documentId,
      fromIndex,
      toIndex,
    });
  }

  private swapDocuments(documentId1: string, documentId2: string): void {
    const currentOrder = this.state.documentOrder;
    const index1 = currentOrder.indexOf(documentId1);
    const index2 = currentOrder.indexOf(documentId2);

    if (index1 === -1 || index2 === -1) {
      throw new Error('One or both documents not found in order');
    }

    const newOrder = [...currentOrder];
    [newOrder[index1], newOrder[index2]] = [newOrder[index2], newOrder[index1]];

    this.dispatch(setDocumentOrder(newOrder));

    this.documentOrderChanged$.emit({
      order: newOrder,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────

  private getDocument(documentId: string): PdfDocumentObject | null {
    const docState = this.coreState.core.documents[documentId];
    return docState?.document ?? null;
  }

  private getDocumentState(documentId: string): DocumentState | null {
    return this.coreState.core.documents[documentId] ?? null;
  }

  private getOpenDocuments(): DocumentState[] {
    return this.state.documentOrder
      .map((documentId) => this.getDocumentState(documentId))
      .filter((state): state is DocumentState => state !== null);
  }

  private isDocumentOpen(documentId: string): boolean {
    return !!this.coreState.core.documents[documentId];
  }

  private getDocumentCount(): number {
    return Object.keys(this.coreState.core.documents).length;
  }

  private getDocumentIndex(documentId: string): number {
    return this.state.documentOrder.indexOf(documentId);
  }

  // ─────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────

  /**
   * Check if the document limit has been reached
   */
  private checkDocumentLimit(): PdfErrorReason | null {
    if (this.maxDocuments && this.getDocumentCount() >= this.maxDocuments) {
      return {
        code: PdfErrorCode.Unknown,
        message: `Maximum number of documents (${this.maxDocuments}) reached`,
      };
    }
    return null;
  }

  /**
   * Validate if a document can be retried
   */
  private validateRetry(documentId: string): {
    valid: boolean;
    error?: PdfErrorReason;
  } {
    const docState = this.coreState.core.documents[documentId];

    if (!docState) {
      return {
        valid: false,
        error: {
          code: PdfErrorCode.NotFound,
          message: `Document ${documentId} not found`,
        },
      };
    }

    if (docState.status === 'loaded') {
      return {
        valid: false,
        error: {
          code: PdfErrorCode.Unknown,
          message: `Document ${documentId} is already loaded successfully`,
        },
      };
    }

    if (docState.status !== 'error') {
      return {
        valid: false,
        error: {
          code: PdfErrorCode.Unknown,
          message: `Document ${documentId} is not in error state (current state: ${docState.status})`,
        },
      };
    }

    if (!this.loadOptions.has(documentId)) {
      return {
        valid: false,
        error: {
          code: PdfErrorCode.Unknown,
          message: `No retry information available for document ${documentId}`,
        },
      };
    }

    return { valid: true };
  }

  /**
   * Retry loading a URL-based document
   */
  private retryUrlDocument(
    documentId: string,
    options: LoadDocumentUrlOptions,
  ): Task<PdfDocumentObject, PdfErrorReason> {
    const file: PdfFileUrl = {
      id: documentId,
      url: options.url,
    };

    return this.engine.openDocumentUrl(file, {
      password: options.password,
      mode: options.mode,
      headers: options.headers,
    });
  }

  /**
   * Retry loading a buffer-based document
   */
  private retryBufferDocument(
    documentId: string,
    options: LoadDocumentBufferOptions,
  ): Task<PdfDocumentObject, PdfErrorReason> {
    const file: PdfFile = {
      id: documentId,
      content: options.buffer,
    };

    return this.engine.openDocumentBuffer(file, {
      password: options.password,
    });
  }

  /**
   * Handle the result of a document load task
   */
  private handleLoadTask(
    documentId: string,
    engineTask: Task<PdfDocumentObject, PdfErrorReason>,
    parentTask: Task<string, PdfErrorReason>,
    context: string,
  ): void {
    engineTask.wait(
      (pdfDocument) => {
        this.dispatchCoreAction(setDocumentLoaded(documentId, pdfDocument));
        parentTask.resolve(documentId);
      },
      (error) => {
        this.handleLoadError(documentId, error, context);
        parentTask.fail(error);
      },
    );
  }

  /**
   * Handle document loading errors consistently
   */
  private handleLoadError(documentId: string, error: any, context: string): void {
    const errorMessage = error.reason?.message || 'Failed to load document';

    this.logger.error('DocumentManagerPlugin', context, 'Failed to load document', error);

    this.dispatchCoreAction(
      setDocumentError(documentId, errorMessage, error.reason?.code, error.reason),
    );

    this.documentError$.emit({
      documentId,
      message: errorMessage,
      code: error.reason?.code,
      reason: error.reason,
    });
  }

  /**
   * Calculate the next active document when closing a document
   */
  private calculateNextActiveDocument(closingDocumentId: string): string | null | undefined {
    const currentActiveId = this.coreState.core.activeDocumentId;

    // Only calculate if we're closing the active document
    if (currentActiveId !== closingDocumentId) {
      return undefined;
    }

    const documentOrder = this.state.documentOrder;
    const closingIndex = documentOrder.indexOf(closingDocumentId);

    if (closingIndex === -1) return undefined;

    // Try left first, then right, then null
    if (closingIndex > 0) {
      return documentOrder[closingIndex - 1];
    } else if (closingIndex < documentOrder.length - 1) {
      return documentOrder[closingIndex + 1];
    } else {
      return null;
    }
  }

  /**
   * Generate a unique document ID
   */
  private generateDocumentId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract filename from URL
   */
  private extractNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'document.pdf';
      return decodeURIComponent(filename);
    } catch {
      return 'document.pdf';
    }
  }

  // ─────────────────────────────────────────────────────────
  // Plugin Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_config: DocumentManagerPluginConfig): Promise<void> {
    this.logger.info('DocumentManagerPlugin', 'Initialize', 'Document Manager Plugin initialized', {
      maxDocuments: this.maxDocuments,
    });
  }

  async destroy(): Promise<void> {
    // Close all documents
    await this.closeAllDocuments().toPromise();

    // Clear load options
    this.loadOptions.clear();

    // Clear emitters
    this.documentOpened$.clear();
    this.documentClosed$.clear();
    this.activeDocumentChanged$.clear();
    this.documentOrderChanged$.clear();

    super.destroy();
  }
}
