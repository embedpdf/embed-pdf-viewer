import { BasePluginConfig, EventHook, DocumentState } from '@embedpdf/core';
import { PdfDocumentObject, Rotation, Task, PdfErrorReason } from '@embedpdf/models';

export interface DocumentManagerPluginConfig extends BasePluginConfig {
  maxDocuments?: number;
}

export interface DocumentManagerState {
  // Track document order (for tabs)
  documentOrder: string[];
}

export interface DocumentChangeEvent {
  previousDocumentId: string | null;
  currentDocumentId: string | null;
}

export interface DocumentOrderChangeEvent {
  order: string[];
  movedDocumentId?: string;
  fromIndex?: number;
  toIndex?: number;
}

export interface DocumentErrorEvent {
  documentId: string;
  message: string;
  code?: number;
  reason?: PdfErrorReason;
}

// Load options
export interface LoadDocumentUrlOptions {
  url: string;
  documentId?: string;
  password?: string;
  mode?: 'auto' | 'range-request' | 'full-fetch';
  headers?: Record<string, string>;
  scale?: number;
  rotation?: Rotation;
}

export interface LoadDocumentBufferOptions {
  buffer: ArrayBuffer;
  name: string;
  documentId?: string;
  password?: string;
  scale?: number;
  rotation?: Rotation;
}

export interface RetryOptions {
  password?: string;
}

export interface DocumentManagerCapability {
  // Document lifecycle
  openFileDialog: () => void;
  openDocumentUrl(options: LoadDocumentUrlOptions): Task<string, PdfErrorReason>;
  openDocumentBuffer(options: LoadDocumentBufferOptions): Task<string, PdfErrorReason>;
  retryDocument(documentId: string, options?: RetryOptions): Task<string, PdfErrorReason>;
  closeDocument(documentId: string): Task<void, PdfErrorReason>;
  closeAllDocuments(): Task<void[], PdfErrorReason>;

  // Active document control
  setActiveDocument(documentId: string): void;
  getActiveDocumentId(): string | null;
  getActiveDocument(): PdfDocumentObject | null;

  // Tab order management
  getDocumentOrder(): string[];
  moveDocument(documentId: string, toIndex: number): void;
  swapDocuments(documentId1: string, documentId2: string): void;

  // Queries
  getDocument(documentId: string): PdfDocumentObject | null;
  getDocumentState(documentId: string): DocumentState | null;
  getOpenDocuments(): DocumentState[];
  isDocumentOpen(documentId: string): boolean;
  getDocumentCount(): number;
  getDocumentIndex(documentId: string): number;

  // Events (now emit DocumentState directly)
  onDocumentOpened: EventHook<DocumentState>;
  onDocumentClosed: EventHook<string>;
  onDocumentError: EventHook<DocumentErrorEvent>;
  onActiveDocumentChanged: EventHook<DocumentChangeEvent>;
  onDocumentOrderChanged: EventHook<DocumentOrderChangeEvent>;
}
