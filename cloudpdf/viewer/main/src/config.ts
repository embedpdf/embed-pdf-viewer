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
import {
  cloudEngine,
  shareSessionSource,
  type CloudEngineOptions,
  type TokenSource,
} from '@cloudpdf/engine';
import type { EngineFactory, InitialDocument } from '@embedpdf/viewer/core';

/**
 * The cloud-only document source: a public share token, resolved to a
 * self-renewing session at open time. This `kind` exists ONLY in the
 * cloud vocabulary — `resolveCloudConfig` lowers it to the open-source
 * viewer's ordinary `{ kind: 'token' }` before the kernel ever sees
 * it, so the engine-agnostic core never learns what a share is.
 */
export interface CloudShareSource {
  kind: 'share';
  /** Public share token (`shr_…`) from the dashboard's embed snippet. */
  shareToken: string;
  /** Passphrase for a protected share. */
  password?: string;
}

/**
 * `InitialDocument`, cloud edition: every open-source `source` still
 * works, plus `{ kind: 'share' }`. Each entry is its own tab with its
 * own credential — mixing share tokens, doc JWTs, and ids in one
 * viewer is fully supported, and every share entry exchanges and
 * renews independently.
 */
export type CloudInitialDocument = Omit<InitialDocument, 'source'> & {
  source: InitialDocument['source'] | CloudShareSource;
};

/** The cloud connection, plus the document shorthands. */
export interface CloudSource extends CloudEngineOptions {
  /** Sugar: open one document by its doc-scoped JWT (`open({ kind: 'token' })`). */
  docToken?: TokenSource;
  /** Sugar: open one document by cloud docId — the engine-level `token` must
   *  authorize it (`open({ kind: 'id' })`). */
  docId?: string;
  /**
   * Sugar: open one document by its public share token (`shr_…`, from
   * the dashboard's embed snippet). The token is exchanged for a
   * short-lived session JWT and silently re-exchanged near expiry —
   * revoking or editing the share on the server retargets every
   * embedded copy at the next renewal. No backend required. For
   * multiple documents, use `documents` with `{ kind: 'share' }`
   * sources instead.
   */
  shareToken?: string;
  /** Passphrase for a protected `shareToken`. */
  sharePassword?: string;
  /** Full control, exactly as the open-source viewer takes it — one tab per
   *  entry, each with its own source, including cloud `{ kind: 'share' }`
   *  entries. Wins over the `docToken`/`docId`/`shareToken` shorthands. */
  documents?: CloudInitialDocument[];
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
    shareToken,
    sharePassword,
    documents,
    ...rest
  } = options;

  const engine: EngineFactory = () => cloudEngine({ baseUrl, token, sessionId, fetch: fetchFn });

  // A share token becomes a self-renewing doc-token source: the
  // exchanged JWT carries `doc_id`, so downstream this is exactly the
  // `docToken` path — the transport re-invokes the source per request
  // and picks up fresh sessions transparently.
  const shareTokenSource = (token_: string, password?: string): TokenSource =>
    shareSessionSource(baseUrl, token_, {
      ...(password !== undefined ? { password } : {}),
      ...(fetchFn ? { fetch: fetchFn } : {}),
    });

  // Lower cloud `{ kind: 'share' }` sources before the kernel sees the
  // list: each entry gets its OWN exchanging source, so a multi-tab
  // viewer mixes shares, doc JWTs, and ids freely and every share
  // renews (and can be revoked) independently.
  const lowerDocument = (doc: CloudInitialDocument): InitialDocument => {
    // `OpenSource` includes a thunk variant, so narrow past functions
    // before reading the discriminant.
    if (typeof doc.source === 'function' || doc.source.kind !== 'share') {
      return doc as InitialDocument;
    }
    const { shareToken: share, password } = doc.source;
    return { ...doc, source: { kind: 'token', token: shareTokenSource(share, password) } };
  };

  const initialDocuments: InitialDocument[] = documents
    ? documents.map(lowerDocument)
    : [
        ...(docToken !== undefined
          ? [{ source: { kind: 'token' as const, token: docToken } }]
          : []),
        ...(shareToken !== undefined
          ? [{ source: { kind: 'token' as const, token: shareTokenSource(shareToken, sharePassword) } }]
          : []),
        ...(docId !== undefined ? [{ source: { kind: 'id' as const, id: docId } }] : []),
      ];

  return { ...rest, engine, documents: initialDocuments };
}
