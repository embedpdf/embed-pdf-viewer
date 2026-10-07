import type {
  CustomMetadataPatch,
  CustomMetadataUpdateResult,
  MetadataPatch,
  MetadataUpdateResult,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { applyCustomMetadataPatch } from './internal/write/applyCustomMetadataPatch';
import { applyMetadataPatch } from './internal/write/applyMetadataPatch';
import { MetadataReader } from './MetadataReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

/**
 * Synchronous orchestrator for document metadata writes. Lives next to
 * `MetadataReader` (one orchestrator per feature) so both worker hosts
 * (browser Web Worker and Node `worker_thread`) share the same code path.
 *
 * A metadata write rewrites the document Info dictionary in place. Like
 * `PagesMutator.move`, it is a structural layer edit: it returns the
 * re-read metadata and a `null` cache (the worker never fills cloud
 * coherence pins — the server does, after persisting the artifact and
 * bumping `metadataVersion`).
 */
export class MetadataMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  update(patch: MetadataPatch, signal: AbortSignal): MetadataUpdateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();

    applyMetadataPatch(fn, mem, docPtr, patch);
    throwIfAborted(signal);

    // Re-read the canonical metadata off the mutated session via the
    // shared reader (identical output local + cloud). No cache delta:
    // local engines have no manifest/CDN; the server adds its own.
    const metadata = new MetadataReader(this.runtime, this.session).read(signal);
    return { metadata, meta: { affectedPages: [], cacheDelta: null, ...this.session.writeStamp() } };
  }

  /** Set and remove custom keys, then re-read them the same way. */
  updateCustom(patch: CustomMetadataPatch, signal: AbortSignal): CustomMetadataUpdateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    applyCustomMetadataPatch(fn, mem, this.session.requireDocPtr(), patch);
    throwIfAborted(signal);
    const custom = new MetadataReader(this.runtime, this.session).readCustom(signal);
    return { custom, meta: { affectedPages: [], cacheDelta: null, ...this.session.writeStamp() } };
  }
}
