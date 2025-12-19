import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { PdfErrorReason, Rect, Task } from '@embedpdf/models';

// Redaction mode enum
export enum RedactionMode {
  MarqueeRedact = 'marqueeRedact',
  RedactSelection = 'redactSelection',
}

export interface SelectedRedaction {
  page: number;
  id: string;
}

// Per-document redaction state
export interface RedactionDocumentState {
  isRedacting: boolean;
  activeType: RedactionMode | null;
  pending: Record<number, RedactionItem[]>;
  pendingCount: number;
  selected: SelectedRedaction | null;
}

// Plugin state
export interface RedactionState {
  documents: Record<string, RedactionDocumentState>;
  activeDocumentId: string | null;
}

export type RedactionItem =
  | {
      id: string;
      kind: 'text';
      page: number;
      rect: Rect;
      rects: Rect[];
    }
  | {
      id: string;
      kind: 'area';
      page: number;
      rect: Rect;
    };

export interface MarqueeRedactCallback {
  onPreview?: (rect: Rect | null) => void;
  onCommit?: (rect: Rect) => void;
}

export interface RegisterMarqueeOnPageOptions {
  documentId: string;
  pageIndex: number;
  scale: number;
  callback: MarqueeRedactCallback;
}

export interface RedactionPluginConfig extends BasePluginConfig {
  drawBlackBoxes: boolean;
}

// Events include documentId
export type RedactionEvent =
  | {
      type: 'add';
      documentId: string;
      items: RedactionItem[];
    }
  | {
      type: 'remove';
      documentId: string;
      page: number;
      id: string;
    }
  | {
      type: 'clear';
      documentId: string;
    }
  | {
      type: 'commit';
      documentId: string;
      success: boolean;
      error?: PdfErrorReason;
    };

export interface PendingChangeEvent {
  documentId: string;
  pending: Record<number, RedactionItem[]>;
}

export interface SelectedChangeEvent {
  documentId: string;
  selected: SelectedRedaction | null;
}

export interface StateChangeEvent {
  documentId: string;
  state: RedactionDocumentState;
}

// Scoped redaction capability
export interface RedactionScope {
  queueCurrentSelectionAsPending(): Task<boolean, PdfErrorReason>;

  enableMarqueeRedact(): void;
  toggleMarqueeRedact(): void;
  isMarqueeRedactActive(): boolean;

  enableRedactSelection(): void;
  toggleRedactSelection(): void;
  isRedactSelectionActive(): boolean;

  addPending(items: RedactionItem[]): void;
  removePending(page: number, id: string): void;
  clearPending(): void;
  commitAllPending(): Task<boolean, PdfErrorReason>;
  commitPending(page: number, id: string): Task<boolean, PdfErrorReason>;

  endRedaction(): void;
  startRedaction(): void;

  selectPending(page: number, id: string): void;
  getSelectedPending(): SelectedRedaction | null;
  deselectPending(): void;

  getState(): RedactionDocumentState;

  onPendingChange: EventHook<Record<number, RedactionItem[]>>;
  onSelectedChange: EventHook<SelectedRedaction | null>;
  onRedactionEvent: EventHook<RedactionEvent>;
  onStateChange: EventHook<RedactionDocumentState>;
}

export interface RedactionCapability {
  // Active document operations
  queueCurrentSelectionAsPending(): Task<boolean, PdfErrorReason>;

  enableMarqueeRedact(): void;
  toggleMarqueeRedact(): void;
  isMarqueeRedactActive(): boolean;

  enableRedactSelection(): void;
  toggleRedactSelection(): void;
  isRedactSelectionActive(): boolean;

  addPending(items: RedactionItem[]): void;
  removePending(page: number, id: string): void;
  clearPending(): void;
  commitAllPending(): Task<boolean, PdfErrorReason>;
  commitPending(page: number, id: string): Task<boolean, PdfErrorReason>;

  endRedaction(): void;
  startRedaction(): void;

  selectPending(page: number, id: string): void;
  getSelectedPending(): SelectedRedaction | null;
  deselectPending(): void;

  getState(): RedactionDocumentState;

  // Document-scoped operations
  forDocument(documentId: string): RedactionScope;

  // Events (include documentId)
  onPendingChange: EventHook<PendingChangeEvent>;
  onSelectedChange: EventHook<SelectedChangeEvent>;
  onRedactionEvent: EventHook<RedactionEvent>;
  onStateChange: EventHook<StateChangeEvent>;
}
