import { createCapabilityToken, type DocumentMetadata, type MetadataPatch } from '@embedpdf/core';

/**
 * The document's Info-dict metadata, held as REACTIVE state — not a one-shot
 * read. It changes from local edits AND from other sessions (a remote edit
 * arrives over SSE as a `metadata.updated` event), so the plugin subscribes to
 * the document event stream and keeps `current()` live. `update` writes a
 * three-state patch into the LAYER (like a page mutation), so a metadata edit
 * saves with the layer.
 */
export interface MetadataState {
  /** Current metadata, or null until the first read resolves. */
  metadata: DocumentMetadata | null;
}

export type MetadataAction = { type: 'SET'; metadata: DocumentMetadata | null };

export interface MetadataCapability {
  /**
   * Whether this caller is authorized to edit the Info dict —
   * `effectiveScope` includes `doc.metadata.modify` (PDF bit 4). UIs gate their
   * edit affordances on this; the engine independently enforces the same
   * capability and throws `PermissionDenied` if a write slips through.
   */
  canEdit(): boolean;
  /** Current metadata; null until the initial read lands. Reactive — reflects
   *  own edits and remote (SSE) edits via the event stream. */
  current(): DocumentMetadata | null;
  /** Patch the Info dict (undefined=leave, null=clear, value=set). Writes to the
   *  layer; state refreshes from the resulting `metadata.updated` event. */
  update(patch: MetadataPatch): Promise<void>;
  /** Force a re-read from the engine (rarely needed — the event stream keeps
   *  state fresh). */
  reload(): Promise<void>;
}

export const MetadataToken = createCapabilityToken<MetadataCapability>('metadata');
