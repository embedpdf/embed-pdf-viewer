import { BasePluginConfig, EventHook } from '@embedpdf/core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum SignatureMode {
  SignatureOnly = 'signature-only',
  SignatureAndInitials = 'signature-and-initials',
}

export enum SignatureCreationType {
  Draw = 'draw',
  Type = 'type',
  Upload = 'upload',
}

export enum SignatureFieldKind {
  Signature = 'signature',
  Initials = 'initials',
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface SignatureInkData {
  inkList: Array<{ points: Array<{ x: number; y: number }> }>;
  strokeWidth: number;
  strokeColor: string;
  size: { width: number; height: number };
}

interface SignatureFieldBase {
  label?: string;
  previewDataUrl: string;
}

export interface SignatureInkFieldDefinition extends SignatureFieldBase {
  creationType: SignatureCreationType.Draw;
  inkData: SignatureInkData;
}

export interface SignatureStampFieldDefinition extends SignatureFieldBase {
  creationType: SignatureCreationType.Type | SignatureCreationType.Upload;
  imageMimeType?: string;
  imageSize?: { width: number; height: number };
  imageData?: ArrayBuffer;
}

export type SignatureFieldDefinition = SignatureInkFieldDefinition | SignatureStampFieldDefinition;

export interface SignatureEntry {
  id: string;
  createdAt: number;
  signature: SignatureFieldDefinition;
  initials?: SignatureFieldDefinition;
}

// ---------------------------------------------------------------------------
// Plugin config
// ---------------------------------------------------------------------------

export interface SignaturePluginConfig extends BasePluginConfig {
  mode: SignatureMode;
  defaultSize?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SignatureState {
  entryIds: string[];
}

// ---------------------------------------------------------------------------
// Tool context types (declaration-merged into ToolContextMap)
// ---------------------------------------------------------------------------

export interface SignatureStampToolContext {
  imageData: ArrayBuffer;
  ghostUrl: string;
  targetSize: { width: number; height: number };
  entryId: string;
  kind: SignatureFieldKind;
}

export interface SignatureInkToolContext {
  inkData: SignatureInkData;
  targetSize: { width: number; height: number };
  entryId: string;
  kind: SignatureFieldKind;
}

declare module '@embedpdf/plugin-annotation' {
  interface ToolContextMap {
    signatureStamp: SignatureStampToolContext;
    signatureInk: SignatureInkToolContext;
  }
}

// ---------------------------------------------------------------------------
// Capability / Scope
// ---------------------------------------------------------------------------

export interface ActivePlacementInfo {
  entryId: string;
  kind: SignatureFieldKind;
}

export interface ActivePlacementChangeEvent {
  documentId: string;
  activePlacement: ActivePlacementInfo | null;
}

export interface SignatureScope {
  activateSignaturePlacement(entryId: string): void;
  activateInitialsPlacement(entryId: string): void;
  deactivatePlacement(): void;
  getActivePlacement(): ActivePlacementInfo | null;
  onActivePlacementChange: EventHook<ActivePlacementInfo | null>;
}

export interface SignatureCapability {
  readonly mode: SignatureMode;
  getEntries(): SignatureEntry[];
  addEntry(entry: Omit<SignatureEntry, 'id' | 'createdAt'>): string;
  removeEntry(id: string): void;
  loadEntries(entries: SignatureEntry[]): void;
  exportEntries(): SignatureEntry[];
  onEntriesChange: EventHook<SignatureEntry[]>;
  forDocument(documentId: string): SignatureScope;
  onActivePlacementChange: EventHook<ActivePlacementChangeEvent>;
}
