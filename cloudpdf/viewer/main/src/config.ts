/**
 * `@cloudpdf/viewer/config` — the CLOUD vocabulary, in one place.
 *
 * Every cloud door (the CDN snippet here, and each `@cloudpdf/viewer-<framework>`
 * wrapper) faces the same job: turn CloudPDF connection options plus a document
 * reference into what the open-source viewer's ENGINE-AGNOSTIC door already
 * takes — an engine factory and a `documents` list — while passing every other
 * option through untouched. That mapping lives here, so the brand vocabulary
 * has exactly one definition and each door stays a genuine shim.
 *
 * Deliberately tiny and framework-free: `cloudEngine` is the only runtime
 * import, so a wrapper that uses this does not drag the CDN artifact along.
 */
import { cloudEngine, type CloudEngineOptions, type TokenSource } from '@cloudpdf/engine';
import type { EngineFactory, InitialDocument } from '@embedpdf/viewer/core';

/** The cloud connection, plus the document shorthands. */
export interface CloudSource extends CloudEngineOptions {
  /** Sugar: open one document by its doc-scoped JWT (`open({ kind: 'token' })`). */
  docToken?: TokenSource;
  /** Sugar: open one document by cloud docId — the engine-level `token` must
   *  authorize it (`open({ kind: 'id' })`). */
  docId?: string;
  /** Full control, exactly as the open-source viewer takes it. Wins over the
   *  `docToken`/`docId` shorthands when present. */
  documents?: InitialDocument[];
}

/**
 * Split cloud options into the engine seam, the initial documents, and
 * everything else — so a door is one call:
 *
 * ```ts
 * EmbedPDF.init(resolveCloudConfig(options));         // vanilla
 * <PDFViewer {...resolveCloudConfig(props)} />        // react
 * ```
 *
 * The engine comes back as a THUNK, which is what gives the viewer ownership of
 * its lifetime: created on mount, destroyed on unmount.
 *
 * The return type is deliberately INFERRED. The destructuring below is the only
 * statement of what this module consumes, so what passes through in `rest` and
 * what the type says passes through are the same fact and cannot drift. Writing
 * the type by hand needs a second list of the same keys, and a second list is
 * the thing that goes stale.
 */
export function resolveCloudConfig<T extends CloudSource>(options: T) {
  const {
    baseUrl,
    token,
    sessionId,
    fetch: fetchFn,
    docToken,
    docId,
    documents,
    ...rest
  } = options;

  const engine: EngineFactory = () => cloudEngine({ baseUrl, token, sessionId, fetch: fetchFn });

  const initialDocuments: InitialDocument[] = documents ?? [
    ...(docToken !== undefined ? [{ source: { kind: 'token' as const, token: docToken } }] : []),
    ...(docId !== undefined ? [{ source: { kind: 'id' as const, id: docId } }] : []),
  ];

  return { ...rest, engine, documents: initialDocuments };
}
