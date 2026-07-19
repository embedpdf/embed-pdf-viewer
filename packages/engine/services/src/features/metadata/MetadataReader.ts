import type { DocumentMetadata } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { readAllCustomMeta } from './internal/readCustomMetadata';
import { readMetaText } from './internal/readMetadataText';
import { readTrapped } from './internal/readTrappedStatus';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { pdfDateToIso } from '../../shared/pdf-date';

/**
 * Synchronous, runtime-agnostic implementation of the metadata read.
 *
 * Lives in @embedpdf/engine-services so it can be reused unchanged by:
 *   - @embedpdf/engine (inside a browser Worker, WASM runtime)
 *   - @cloudpdf/server       (inside a Node worker_thread, native runtime)
 *
 * Async-ness lives at the worker boundary, not here.
 */
export class MetadataReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(signal: AbortSignal): DocumentMetadata {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const doc = this.session.requireDocPtr();

    const title = readMetaText(fn, mem, doc, 'Title');
    throwIfAborted(signal);
    const author = readMetaText(fn, mem, doc, 'Author');
    throwIfAborted(signal);
    const subject = readMetaText(fn, mem, doc, 'Subject');
    throwIfAborted(signal);
    const keywords = readMetaText(fn, mem, doc, 'Keywords');
    throwIfAborted(signal);
    const producer = readMetaText(fn, mem, doc, 'Producer');
    throwIfAborted(signal);
    const creator = readMetaText(fn, mem, doc, 'Creator');
    throwIfAborted(signal);
    const creationRaw = readMetaText(fn, mem, doc, 'CreationDate');
    throwIfAborted(signal);
    const modRaw = readMetaText(fn, mem, doc, 'ModDate');
    throwIfAborted(signal);
    const trapped = readTrapped(fn, doc);
    throwIfAborted(signal);
    const custom = readAllCustomMeta(fn, mem, doc);

    return {
      title,
      author,
      subject,
      keywords,
      producer,
      creator,
      created: creationRaw ? pdfDateToIso(creationRaw) : null,
      modified: modRaw ? pdfDateToIso(modRaw) : null,
      trapped,
      custom,
    };
  }
}
