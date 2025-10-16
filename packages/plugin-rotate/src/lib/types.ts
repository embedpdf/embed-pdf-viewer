import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Rotation } from '@embedpdf/models';

export interface RotatePluginConfig extends BasePluginConfig {
  defaultRotation?: Rotation;
}

export interface GetMatrixOptions {
  w: number;
  h: number;
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
  getMatrixAsString(options: GetMatrixOptions): string;
  onRotateChange: EventHook<Rotation>;
}

export interface RotateCapability {
  // Active document operations
  setRotation(rotation: Rotation): void;
  getRotation(): Rotation;
  rotateForward(): void;
  rotateBackward(): void;
  getMatrixAsString(options: GetMatrixOptions): string;

  // Document-scoped operations
  forDocument(documentId: string): RotateScope;

  // Events
  onRotateChange: EventHook<RotationChangeEvent>;
}
