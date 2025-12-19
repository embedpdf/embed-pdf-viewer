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
  moveDocument as moveDocumentAction,
  reorderDocuments as reorderDocumentsAction,
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
  DocumentManagerCapability,
  DocumentChangeEvent,
  DocumentOrderChangeEvent,
  LoadDocumentUrlOptions,
  LoadDocumentBufferOptions,
  RetryOptions,
  DocumentErrorEvent,
  OpenDocumentResponse,
  OpenFileDialogOptions,
} from './types';

export class DocumentManagerPlugin extends BasePlugin<
  DocumentManagerPluginConfig,
  DocumentManagerCapability
> {
  static readonly id = 'document-manager' as const;

  private readonly documentOpened$ = createBehaviorEmitter<DocumentState>();
  private readonly documentClosed$ = createBehaviorEmitter<string>();
  private readonly activeDocumentChanged$ = createBehaviorEmitter<DocumentChangeEvent>();
  private readonly documentError$ = createBehaviorEmitter<DocumentErrorEvent>();

  private readonly documentOrderChanged$ = createBehaviorEmitter<DocumentOrderChangeEvent>();

  private readonly openFileRequest$ = createEmitter<{
    task: Task<OpenDocumentResponse, PdfErrorReason>;
    options?: OpenFileDialogOptions;
  }>();

  private maxDocuments?: number;

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
      // Document lifecycle - orchestration only
      openFileDialog: (options) => this.openFileDialog(options),
      openDocumentUrl: (options) => this.openDocumentUrl(options),
      openDocumentBuffer: (options) => this.openDocumentBuffer(options),
      retryDocument: (documentId, options) => this.retryDocument(documentId, options),
      closeDocument: (documentId) => this.closeDocument(documentId),
      closeAllDocuments: () => this.closeAllDocuments(),

      setActiveDocument: (documentId) => {
        if (!this.isDocumentOpen(documentId)) {
          throw new Error(`Cannot set active document: ${documentId} is not open`);
        }
        this.dispatchCoreAction(setActiveDocumentAction(documentId));
      },

      getActiveDocumentId: () => this.coreState.core.activeDocumentId,
      getActiveDocument: () => {
        const activeId = this.coreState.core.activeDocumentId;
        if (!activeId) return null;
        return this.coreState.core.documents[activeId]?.document ?? null;
      },

      getDocumentOrder: () => this.coreState.core.documentOrder,

      moveDocument: (documentId, toIndex) => {
        this.dispatchCoreAction(moveDocumentAction(documentId, toIndex));
      },

      swapDocuments: (id1, id2) => {
        const order = this.coreState.core.documentOrder;
        const index1 = order.indexOf(id1);
        const index2 = order.indexOf(id2);

        if (index1 === -1 || index2 === -1) {
          throw new Error('One or both documents not found in order');
        }

        const newOrder = [...order];
        [newOrder[index1], newOrder[index2]] = [newOrder[index2], newOrder[index1]];

        this.dispatchCoreAction(reorderDocumentsAction(newOrder));
      },

      getDocument: (documentId) => {
        return this.coreState.core.documents[documentId]?.document ?? null;
      },

      getDocumentState: (documentId) => {
        return this.coreState.core.documents[documentId] ?? null;
      },

      getOpenDocuments: () => {
        return this.coreState.core.documentOrder
          .map((documentId) => this.coreState.core.documents[documentId])
          .filter((state): state is DocumentState => state !== null);
      },

      isDocumentOpen: (documentId) => this.isDocumentOpen(documentId),

      getDocumentCount: () => {
        return Object.keys(this.coreState.core.documents).length;
      },

      getDocumentIndex: (documentId) => {
        return this.coreState.core.documentOrder.indexOf(documentId);
      },

      // Events
      onDocumentOpened: this.documentOpened$.on,
      onDocumentClosed: this.documentClosed$.on,
      onDocumentError: this.documentError$.on,
      onActiveDocumentChanged: this.activeDocumentChanged$.on,
      onDocumentOrderChanged: this.documentOrderChanged$.on,
    };
  }

  /**
   * Check if a document is currently open
   */
  private isDocumentOpen(documentId: string): boolean {
    return !!this.coreState.core.documents[documentId];
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoaded(documentId: string): void {
    const docState = this.coreState.core.documents[documentId];
    if (!docState || docState.status !== 'loaded') return;

    // Clean up load options to free memory
    this.loadOptions.delete(documentId);

    // Emit opened event
    this.documentOpened$.emit(docState);

    this.logger.info(
      'DocumentManagerPlugin',
      'DocumentOpened',
      `Document ${documentId} opened successfully`,
      { name: docState.name },
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Clean up load options
    this.loadOptions.delete(documentId);

    // Emit closed event
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

  protected override onCoreStoreUpdated(oldState: any, newState: any): void {
    // Emit order change event if order changed
    if (oldState.core.documentOrder !== newState.core.documentOrder) {
      this.documentOrderChanged$.emit({
        order: newState.core.documentOrder,
      });
    }
  }

  public onOpenFileRequest(
    handler: Listener<{
      task: Task<OpenDocumentResponse, PdfErrorReason>;
      options?: OpenFileDialogOptions;
    }>,
  ): Unsubscribe {
    return this.openFileRequest$.on(handler);
  }

  // ─────────────────────────────────────────────────────────
  // Document Loading (orchestration only - no state management)
  // ─────────────────────────────────────────────────────────

  private openDocumentUrl(
    options: LoadDocumentUrlOptions,
  ): Task<OpenDocumentResponse, PdfErrorReason> {
    const task = new Task<OpenDocumentResponse, PdfErrorReason>();

    const documentId = options.documentId || this.generateDocumentId();

    // Check limit
    const limitError = this.checkDocumentLimit();
    if (limitError) {
      task.reject(limitError);
      return task;
    }

    const documentName = options.name ?? this.extractNameFromUrl(options.url);

    // Store options for potential retry
    this.loadOptions.set(documentId, options);

    this.dispatchCoreAction(
      startLoadingDocument(
        documentId,
        documentName,
        options.scale,
        options.rotation,
        !!options.password,
        options.autoActivate,
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
      requestOptions: options.requestOptions,
    });

    task.resolve({
      documentId,
      task: engineTask,
    });

    // Handle result
    this.handleLoadTask(documentId, engineTask, 'OpenDocumentUrl');

    return task;
  }

  private openDocumentBuffer(
    options: LoadDocumentBufferOptions,
  ): Task<OpenDocumentResponse, PdfErrorReason> {
    const task = new Task<OpenDocumentResponse, PdfErrorReason>();

    const limitError = this.checkDocumentLimit();
    if (limitError) {
      task.reject(limitError);
      return task;
    }

    const documentId = options.documentId || this.generateDocumentId();

    // Store options for potential retry
    this.loadOptions.set(documentId, options);

    this.dispatchCoreAction(
      startLoadingDocument(
        documentId,
        options.name,
        options.scale,
        options.rotation,
        !!options.password,
        options.autoActivate,
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

    task.resolve({
      documentId,
      task: engineTask,
    });

    // Handle result
    this.handleLoadTask(documentId, engineTask, 'OpenDocumentBuffer');

    return task;
  }

  private retryDocument(
    documentId: string,
    retryOptions?: RetryOptions,
  ): Task<OpenDocumentResponse, PdfErrorReason> {
    const task = new Task<OpenDocumentResponse, PdfErrorReason>();

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

    task.resolve({
      documentId,
      task: engineTask,
    });

    // Handle result
    this.handleLoadTask(documentId, engineTask, 'RetryDocument');

    return task;
  }

  private openFileDialog(
    options?: OpenFileDialogOptions,
  ): Task<OpenDocumentResponse, PdfErrorReason> {
    const task = new Task<OpenDocumentResponse, PdfErrorReason>();
    this.openFileRequest$.emit({ task, options });
    return task;
  }

  private closeDocument(documentId: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const docState = this.coreState.core.documents[documentId];
    if (!docState) {
      this.logger.warn(
        'DocumentManagerPlugin',
        'CloseDocument',
        `Cannot close document ${documentId}: not found in state`,
      );
      task.resolve();
      return task;
    }

    // ✅ SIMPLIFIED: Just dispatch - reducer calculates next active!
    if (docState.status === 'loaded' && docState.document) {
      this.engine.closeDocument(docState.document).wait(
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
    } else {
      // Document is not loaded (error, loading, etc.), just clean up state
      this.logger.info(
        'DocumentManagerPlugin',
        'CloseDocument',
        `Closing document ${documentId} in ${docState.status} state (skipping engine close)`,
      );
      this.dispatchCoreAction(closeDocumentAction(documentId));
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
  // Helper Methods
  // ─────────────────────────────────────────────────────────

  private checkDocumentLimit(): PdfErrorReason | null {
    if (
      this.maxDocuments &&
      Object.keys(this.coreState.core.documents).length >= this.maxDocuments
    ) {
      return {
        code: PdfErrorCode.Unknown,
        message: `Maximum number of documents (${this.maxDocuments}) reached`,
      };
    }
    return null;
  }

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
      requestOptions: options.requestOptions,
    });
  }

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

  private handleLoadTask(
    documentId: string,
    engineTask: Task<PdfDocumentObject, PdfErrorReason>,
    context: string,
  ): void {
    engineTask.wait(
      (pdfDocument) => {
        this.dispatchCoreAction(setDocumentLoaded(documentId, pdfDocument));
      },
      (error) => {
        this.handleLoadError(documentId, error, context);
      },
    );
  }

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

  private generateDocumentId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractNameFromUrl(url: string): string | undefined {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastSegment = pathname.split('/').pop();
      if (!lastSegment) {
        return undefined;
      }
      let filename = decodeURIComponent(lastSegment);
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
      }
      return filename;
    } catch {
      return undefined;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Plugin Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(config: DocumentManagerPluginConfig): Promise<void> {
    this.logger.info('DocumentManagerPlugin', 'Initialize', 'Document Manager Plugin initialized', {
      maxDocuments: this.maxDocuments,
      initialDocumentsCount: config.initialDocuments?.length ?? 0,
    });

    // Handle initial documents from config
    if (config.initialDocuments && config.initialDocuments.length > 0) {
      // Process strictly in order
      for (const docConfig of config.initialDocuments) {
        try {
          // Type guard to distinguish between URL and Buffer options
          if ('buffer' in docConfig) {
            this.openDocumentBuffer(docConfig);
          } else if ('url' in docConfig) {
            this.openDocumentUrl(docConfig);
          }
        } catch (error) {
          this.logger.error(
            'DocumentManagerPlugin',
            'Initialize',
            'Failed to initiate initial document load',
            error,
          );
        }
      }
    }
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
    this.documentError$.clear();

    super.destroy();
  }
}
