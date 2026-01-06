import { BasePluginConfig, EventHook, DocumentState } from '@embedpdf/core';
import {
  PdfDocumentObject,
  Rotation,
  Task,
  PdfErrorReason,
  PdfRequestOptions,
} from '@embedpdf/models';

export type InitialDocumentOptions = LoadDocumentUrlOptions | LoadDocumentBufferOptions;

export interface DocumentManagerPluginConfig extends BasePluginConfig {
  maxDocuments?: number;
  initialDocuments?: InitialDocumentOptions[];
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
  name?: string; // Optional display name for the document. If not provided, extracted from URL
  password?: string;
  mode?: 'auto' | 'range-request' | 'full-fetch';
  requestOptions?: PdfRequestOptions;
  scale?: number;
  rotation?: Rotation;
  autoActivate?: boolean; // If true, this document becomes active when opened. Default: true
}

export interface LoadDocumentBufferOptions {
  buffer: ArrayBuffer;
  name: string;
  documentId?: string;
  password?: string;
  scale?: number;
  rotation?: Rotation;
  autoActivate?: boolean; // If true, this document becomes active when opened. Default: true
}

export interface RetryOptions {
  password?: string;
}

export interface OpenFileDialogOptions {
  documentId?: string;
  scale?: number;
  rotation?: Rotation;
  autoActivate?: boolean;
}

export interface OpenDocumentResponse {
  documentId: string;
  task: Task<PdfDocumentObject, PdfErrorReason>;
}

export interface DocumentManagerCapability {
  // Document lifecycle
  openFileDialog: (options?: OpenFileDialogOptions) => Task<OpenDocumentResponse, PdfErrorReason>;
  openDocumentUrl(options: LoadDocumentUrlOptions): Task<OpenDocumentResponse, PdfErrorReason>;
  openDocumentBuffer(
    options: LoadDocumentBufferOptions,
  ): Task<OpenDocumentResponse, PdfErrorReason>;
  retryDocument(
    documentId: string,
    options?: RetryOptions,
  ): Task<OpenDocumentResponse, PdfErrorReason>;
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
  onFileSelected: EventHook<File>;

  // file chosen
  fileSelected(file: File): void;
}
