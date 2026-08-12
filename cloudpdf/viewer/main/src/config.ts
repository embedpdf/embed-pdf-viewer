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
  type CloudEngineOptions,
  type OpenInputShare,
  type TokenSource,
} from '@cloudpdf/engine';
import type { EngineFactory, InitialDocument } from '@embedpdf/viewer/core';

/**
 * @deprecated `{ kind: 'share' }` is a standard `OpenInput` kind now
 * (`OpenInputShare` from `@cloudpdf/engine`), understood by
 * `engine.open()` directly. Note the grant passphrase field is
 * `sharePassword` (was `password` on the old viewer-only type).
 */
export type CloudShareSource = OpenInputShare;

/**
 * @deprecated Cloud share sources are part of the standard `OpenInput`
 * union, so the ordinary `InitialDocument` from `@embedpdf/viewer/core`
 * already admits them. Use it directly.
 */
export type CloudInitialDocument = InitialDocument;

/** The cloud connection, plus the document shorthands. */
export interface CloudSource extends CloudEngineOptions {
  /** Sugar: open one document by its doc-scoped JWT (`open({ kind: 'token' })`). */
  docToken?: TokenSource;
  /** Sugar: open one document by cloud docId — the engine-level `token` must
   *  authorize it (`open({ kind: 'id' })`). */
  docId?: string;
  /**
   * Sugar: open one document by its public share token (`shr_…`, from
   * the dashboard's embed snippet) — `open({ kind: 'share' })`. The
   * engine exchanges it for a short-lived session JWT and silently
   * re-exchanges near expiry — revoking or editing the share on the
   * server retargets every embedded copy at the next renewal. No
   * backend required. For multiple documents, use `documents` with
   * `{ kind: 'share' }` sources instead.
   */
  shareToken?: string;
  /** Passphrase for a protected `shareToken`. */
  sharePassword?: string;
  /** Full control, exactly as the open-source viewer takes it — one tab per
   *  entry, each with its own source, including `{ kind: 'share' }` entries
   *  (a standard OpenInput kind the cloud engine resolves itself). Wins over
   *  the `docToken`/`docId`/`shareToken` shorthands. */
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
 * Document sources need no lowering here: `{ kind: 'share' }` is part of the
 * standard `OpenInput` union and the cloud engine resolves it itself
 * (exchange, renewal, revocation-at-renewal). This module only expands the
 * one-document shorthands.
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

  const initialDocuments: InitialDocument[] = documents ?? [
    ...(docToken !== undefined ? [{ source: { kind: 'token' as const, token: docToken } }] : []),
    ...(shareToken !== undefined
      ? [
          {
            source: {
              kind: 'share' as const,
              shareToken,
              ...(sharePassword !== undefined ? { sharePassword } : {}),
            },
          },
        ]
      : []),
    ...(docId !== undefined ? [{ source: { kind: 'id' as const, id: docId } }] : []),
  ];

  return { ...rest, engine, documents: initialDocuments };
}
