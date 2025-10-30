import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Rotation } from '@embedpdf/models';

export interface RotatePluginConfig extends BasePluginConfig {
  defaultRotation?: Rotation;
}

export interface GetMatrixOptions {
  width: number;
  height: number;
  rotation: Rotation;
}

// Per-document rotation state
export interface RotateDocumentState {
  rotation: Rotation;
}

export interface RotateState {
  documents: Record<string, RotateDocumentState>;
  activeDocumentId: string | null;
}

// Events include documentId
export interface RotationChangeEvent {
  documentId: string;
  rotation: Rotation;
}

// Scoped rotate capability
export interface RotateScope {
  setRotation(rotation: Rotation): void;
  getRotation(): Rotation;
  rotateForward(): void;
  rotateBackward(): void;
  onRotateChange: EventHook<Rotation>;
}

export interface RotateCapability {
  // Active document operations
  setRotation(rotation: Rotation): void;
  getRotation(): Rotation;
  rotateForward(): void;
  rotateBackward(): void;

  // Document-scoped operations
  forDocument(documentId: string): RotateScope;

  // Events
  onRotateChange: EventHook<RotationChangeEvent>;
}
