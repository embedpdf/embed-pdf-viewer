import { EngineError, EngineErrorCode, type DocumentHandle, type Engine } from '@embedpdf/engine';

/** What opening a dropped PDF found. On `ready`, the document is open and the caller closes it. */
export type Opened =
  | {
      readonly kind: 'ready';
      readonly doc: DocumentHandle;
      readonly pageCount: number;
      /** It holds a signature, which a change to the file can't keep valid. */
      readonly signed: boolean;
    }
  | { readonly kind: 'locked'; readonly incorrect: boolean }
  | { readonly kind: 'unreadable' };

/**
 * Open a PDF the user dropped, with its password when they gave one: ready, waiting for its
 * password (`incorrect` once a wrong one was tried), or not readable at all. The engine takes over
 * the buffer it's given, so it gets a copy and the tool keeps the bytes.
 */
export async function openPdf(
  engine: Engine,
  bytes: Uint8Array,
  password?: string,
): Promise<Opened> {
  let doc: DocumentHandle;
  try {
    doc = await engine.open(
      { kind: 'bytes', bytes: bytes.slice() },
      password ? { password } : undefined,
    );
  } catch {
    return { kind: 'unreadable' };
  }
  try {
    const prompt = doc.security.passwordPrompt;
    if (prompt.state === 'required') {
      await doc.close().catch(() => {});
      return { kind: 'locked', incorrect: prompt.incorrect };
    }
    const { pageCount } = await doc.pages.list();
    if (pageCount === 0) throw new Error('no pages');
    const signed = await doc.signatures
      .list()
      .then(({ signatures }) => signatures.some((signature) => signature.signed))
      .catch(() => false);
    return { kind: 'ready', doc, pageCount, signed };
  } catch {
    await doc.close().catch(() => {});
    return { kind: 'unreadable' };
  }
}

/**
 * The document as a file to download: written whole (`'rewrite'`), so what was removed is really
 * gone. A signed document refuses a rewrite (it would void the signature), so it's saved
 * incrementally instead: its signed version stays inside the file.
 */
export async function downloadWhole(doc: DocumentHandle): Promise<Uint8Array> {
  return doc.download({ mode: 'rewrite' }).catch((error: unknown) => {
    if (!EngineError.is(error, EngineErrorCode.ProtectedDocument)) throw error;
    return doc.download({ mode: 'incremental' });
  });
}
