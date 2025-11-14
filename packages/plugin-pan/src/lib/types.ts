import { BasePluginConfig, EventHook } from '@embedpdf/core';

export type PanDefaultMode = 'never' | 'mobile' | 'always';

export interface PanPluginConfig extends BasePluginConfig {
  /** When should pan be the default interaction mode?
   *  – 'never' (default) : pointerMode stays the default
   *  – 'mobile' : default only on touch devices
   *  – 'always' : default on every device           */
  defaultMode?: PanDefaultMode;
}

// Per-document pan state
export interface PanDocumentState {
  isPanMode: boolean;
}

export interface PanState {
  documents: Record<string, PanDocumentState>;
  activeDocumentId: string | null;
}

// Events include documentId
export interface PanModeChangeEvent {
  documentId: string;
  isPanMode: boolean;
}

// Scoped pan capability
export interface PanScope {
  enablePan: () => void;
  disablePan: () => void;
  togglePan: () => void;
  isPanMode: () => boolean;
  onPanModeChange: EventHook<boolean>;
}

export interface PanCapability {
  // Active document operations
  enablePan: () => void;
  disablePan: () => void;
  togglePan: () => void;
  makePanDefault: (autoActivate?: boolean) => void;
  isPanMode: () => boolean;

  // Document-scoped operations
  forDocument(documentId: string): PanScope;

  // Events
  onPanModeChange: EventHook<PanModeChangeEvent>;
}
