import { BasePluginConfig, EventHook } from '@embedpdf/core';

export interface SpreadPluginConfig extends BasePluginConfig {
  defaultSpreadMode?: SpreadMode;
}

export enum SpreadMode {
  None = 'none',
  Odd = 'odd',
  Even = 'even',
}

// Per-document spread state
export interface SpreadDocumentState {
  spreadMode: SpreadMode;
}

export interface SpreadState {
  documents: Record<string, SpreadDocumentState>;
  activeDocumentId: string | null;
}

// Events include documentId
export interface SpreadChangeEvent {
  documentId: string;
  spreadMode: SpreadMode;
}

// Scoped spread capability
export interface SpreadScope {
  setSpreadMode(mode: SpreadMode): void;
  getSpreadMode(): SpreadMode;
  onSpreadChange: EventHook<SpreadMode>;
}

export interface SpreadCapability {
  // Active document operations
  setSpreadMode(mode: SpreadMode): void;
  getSpreadMode(): SpreadMode;

  // Document-scoped operations
  forDocument(documentId: string): SpreadScope;

  // Events
  onSpreadChange: EventHook<SpreadChangeEvent>;
}
