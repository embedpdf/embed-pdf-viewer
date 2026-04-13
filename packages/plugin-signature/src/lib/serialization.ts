import {
  SignatureEntry,
  SignatureFieldDefinition,
  SignatureCreationType,
  SignatureStampFieldDefinition,
} from './types';

// ---------------------------------------------------------------------------
// Serialized types (JSON-safe — ArrayBuffer replaced with base64 strings)
// ---------------------------------------------------------------------------

export interface SerializedSignatureStampField {
  creationType: SignatureCreationType.Type | SignatureCreationType.Upload;
  label?: string;
  previewDataUrl: string;
  imageMimeType?: string;
  imageSize?: { width: number; height: number };
  imageData?: string;
}

export type SerializedSignatureFieldDefinition =
  | import('./types').SignatureInkFieldDefinition
  | SerializedSignatureStampField;

export interface SerializedSignatureEntry {
  id: string;
  createdAt: number;
  signature: SerializedSignatureFieldDefinition;
  initials?: SerializedSignatureFieldDefinition;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function serializeField(field: SignatureFieldDefinition): SerializedSignatureFieldDefinition {
  if (field.creationType === SignatureCreationType.Draw) {
    return field;
  }
  const { imageData, ...rest } = field;
  return {
    ...rest,
    imageData: imageData ? arrayBufferToBase64(imageData) : undefined,
  };
}

function deserializeField(field: SerializedSignatureFieldDefinition): SignatureFieldDefinition {
  if (field.creationType === SignatureCreationType.Draw) {
    return field;
  }
  const { imageData, ...rest } = field;
  return {
    ...rest,
    imageData: imageData ? base64ToArrayBuffer(imageData) : undefined,
  } as SignatureStampFieldDefinition;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts signature entries into a JSON-safe format by encoding
 * ArrayBuffer fields as base64 strings. Use with `JSON.stringify`
 * for persistence (e.g. localStorage, IndexedDB, or a backend API).
 */
export function serializeEntries(entries: SignatureEntry[]): SerializedSignatureEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    signature: serializeField(entry.signature),
    ...(entry.initials && { initials: serializeField(entry.initials) }),
  }));
}

/**
 * Restores signature entries from the JSON-safe format produced by
 * `serializeEntries`, converting base64 strings back to ArrayBuffers.
 */
export function deserializeEntries(data: SerializedSignatureEntry[]): SignatureEntry[] {
  return data.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    signature: deserializeField(entry.signature),
    ...(entry.initials && { initials: deserializeField(entry.initials) }),
  }));
}
