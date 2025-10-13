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
  private readonly openFileRequest$ = createBehaviorEmitter<'open'>();

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
      getActiveDocumentId: () => this.getActiveDocumentId(),
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

  protected override onDocumentLoaded(documentId: string): void {
    const docState = this.coreState.core.documents[documentId];
    if (!docState) return;

    // Only emit event when document is successfully loaded
    if (docState.status === 'loaded') {
      // Add to document order
      this.dispatch(addToDocumentOrder(documentId));

      // Clean up load options to free memory
      this.loadOptions.delete(documentId);

      // Emit opened event with DocumentState directly
      this.documentOpened$.emit(docState);

      this.logger.info(
        'DocumentManagerPlugin',
        'DocumentOpened',
        `Document ${documentId} opened successfully`,
        { name: docState.document?.name },
      );
    }
  }

  protected override onDocumentClosed(documentId: string): void {
    // Remove from order
    this.dispatch(removeFromDocumentOrder(documentId));

    // Clean up load options
    this.loadOptions.delete(documentId);

    this.documentClosed$.emit(documentId);

    this.logger.info('DocumentManagerPlugin', 'DocumentClosed', `Document ${documentId} closed`);
  }

  protected override onActiveDocumentChanged(
    previousId: string | null,
    currentId: string | null,
  ): void {
    const event: DocumentChangeEvent = {
      previousDocumentId: previousId,
      currentDocumentId: currentId,
    };

    this.activeDocumentChanged$.emit(event);

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

    // Check document limit
    if (this.maxDocuments && this.getDocumentCount() >= this.maxDocuments) {
      task.reject({
        code: PdfErrorCode.Unknown,
        message: `Maximum number of documents (${this.maxDocuments}) reached`,
      });
      return task;
    }

    const documentId = options.documentId || this.generateDocumentId();

    // Store options for potential retry (will be cleared on success)
    this.loadOptions.set(documentId, options);

    // Immediately create loading state
    this.dispatchCoreAction(startLoadingDocument(documentId, options.scale, options.rotation));

    this.logger.info(
      'DocumentManagerPlugin',
      'OpenDocumentUrl',
      `Starting to load document from URL: ${options.url}`,
      { documentId },
    );

    // Create file object for engine
    const file: PdfFileUrl = {
      id: documentId,
      name: this.extractNameFromUrl(options.url),
      url: options.url,
    };

    // Call engine to load document
    const engineTask = this.engine.openDocumentUrl(file, {
      password: options.password,
      mode: options.mode,
      headers: options.headers,
    });

    // Handle result
    engineTask.wait(
      (pdfDocument) => {
        // Update to loaded state
        this.dispatchCoreAction(setDocumentLoaded(documentId, pdfDocument));

        task.resolve(documentId);
      },
      (error) => {
        this.logger.error(
          'DocumentManagerPlugin',
          'OpenDocumentUrl',
          'Failed to load document',
          error,
        );

        // Update to error state (keep loadOptions for retry)
        this.dispatchCoreAction(
          setDocumentError(
            documentId,
            error.reason?.message || 'Failed to load document',
            error.reason?.code,
            error.reason,
          ),
        );

        this.documentError$.emit({
          documentId,
          message: error.reason?.message || 'Failed to load document',
          code: error.reason?.code,
          reason: error.reason,
        });

        task.fail(error);
      },
    );

    return task;
  }

  private openDocumentBuffer(options: LoadDocumentBufferOptions): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    if (this.maxDocuments && this.getDocumentCount() >= this.maxDocuments) {
      task.reject({
        code: PdfErrorCode.Unknown,
        message: `Maximum number of documents (${this.maxDocuments}) reached`,
      });
      return task;
    }

    const documentId = options.documentId || this.generateDocumentId();

    // Store options for potential retry (will be cleared on success)
    this.loadOptions.set(documentId, options);

    // Immediately create loading state
    this.dispatchCoreAction(startLoadingDocument(documentId, options.scale, options.rotation));

    this.logger.info(
      'DocumentManagerPlugin',
      'OpenDocumentBuffer',
      `Starting to load document from buffer: ${options.name}`,
      { documentId },
    );

    const file: PdfFile = {
      id: documentId,
      name: options.name,
      content: options.buffer,
    };

    const engineTask = this.engine.openDocumentBuffer(file, {
      password: options.password,
    });

    engineTask.wait(
      (pdfDocument) => {
        this.dispatchCoreAction(setDocumentLoaded(documentId, pdfDocument));
        task.resolve(documentId);
      },
      (error) => {
        this.logger.error(
          'DocumentManagerPlugin',
          'OpenDocumentBuffer',
          'Failed to load document',
          error,
        );

        this.dispatchCoreAction(
          setDocumentError(
            documentId,
            error.reason?.message || 'Failed to load document',
            error.reason?.code,
            error.reason,
          ),
        );

        this.documentError$.emit({
          documentId,
          message: error.reason?.message || 'Failed to load document',
          code: error.reason?.code,
          reason: error.reason,
        });

        task.fail(error);
      },
    );

    return task;
  }

  private retryDocument(
    documentId: string,
    retryOptions?: RetryOptions,
  ): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    const docState = this.coreState.core.documents[documentId];
    if (!docState) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Document ${documentId} not found`,
      });
      return task;
    }

    // Check if document is already loaded successfully
    if (docState.status === 'loaded') {
      task.reject({
        code: PdfErrorCode.Unknown,
        message: `Document ${documentId} is already loaded successfully`,
      });
      return task;
    }

    if (docState.status !== 'error') {
      task.reject({
        code: PdfErrorCode.Unknown,
        message: `Document ${documentId} is not in error state (current state: ${docState.status})`,
      });
      return task;
    }

    const originalOptions = this.loadOptions.get(documentId);
    if (!originalOptions) {
      task.reject({
        code: PdfErrorCode.Unknown,
        message: `No retry information available for document ${documentId}`,
      });
      return task;
    }

    // Merge retry options (e.g., new password)
    const mergedOptions = {
      ...originalOptions,
      ...(retryOptions?.password && { password: retryOptions.password }),
    };

    // Update stored options
    this.loadOptions.set(documentId, mergedOptions);

    // Set back to loading state
    this.dispatchCoreAction(retryLoadingDocument(documentId));

    this.logger.info(
      'DocumentManagerPlugin',
      'RetryDocument',
      `Retrying to load document ${documentId}`,
    );

    // Retry the load
    if ('url' in mergedOptions) {
      const file: PdfFileUrl = {
        id: documentId,
        name: this.extractNameFromUrl(mergedOptions.url),
        url: mergedOptions.url,
      };

      const engineTask = this.engine.openDocumentUrl(file, {
        password: mergedOptions.password,
        mode: mergedOptions.mode,
        headers: mergedOptions.headers,
      });

      engineTask.wait(
        (pdfDocument) => {
          this.dispatchCoreAction(setDocumentLoaded(documentId, pdfDocument));
          task.resolve(documentId);
        },
        (error) => {
          this.dispatchCoreAction(
            setDocumentError(
              documentId,
              error.reason?.message || 'Failed to load document',
              error.reason?.code,
              error.reason,
            ),
          );
          this.documentError$.emit({
            documentId,
            message: error.reason?.message || 'Failed to load document',
            code: error.reason?.code,
            reason: error.reason,
          });
          task.fail(error);
        },
      );
    } else {
      // Buffer retry
      const file: PdfFile = {
        id: documentId,
        name: mergedOptions.name,
        content: mergedOptions.buffer,
      };

      const engineTask = this.engine.openDocumentBuffer(file, {
        password: mergedOptions.password,
      });

      engineTask.wait(
        (pdfDocument) => {
          this.dispatchCoreAction(setDocumentLoaded(documentId, pdfDocument));
          task.resolve(documentId);
        },
        (error) => {
          this.dispatchCoreAction(
            setDocumentError(
              documentId,
              error.reason?.message || 'Failed to load document',
              error.reason?.code,
              error.reason,
            ),
          );
          this.documentError$.emit({
            documentId,
            message: error.reason?.message || 'Failed to load document',
            code: error.reason?.code,
            reason: error.reason,
          });
          task.fail(error);
        },
      );
    }

    return task;
  }

  private closeDocument(documentId: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const document = this.getDocument(documentId);
    if (!document) {
      this.logger.warn(
        'DocumentManagerPlugin',
        'CloseDocument',
        `Cannot close document ${documentId}: not open`,
      );
      task.resolve();
      return task;
    }

    this.engine.closeDocument(document).wait(
      () => {
        this.dispatchCoreAction(closeDocumentAction(documentId));
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

  private getActiveDocumentId(): string | null {
    return this.coreState.core.activeDocumentId;
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
    // Return in order
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
  // Helpers
  // ─────────────────────────────────────────────────────────

  private generateDocumentId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

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
