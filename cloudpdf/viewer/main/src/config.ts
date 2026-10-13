/**
 * `@cloudpdf/viewer/config` — the cloud vocabulary, in one place.
 *
 * Every cloud door (the CDN snippet here, and each `@cloudpdf/viewer-<framework>`
 * wrapper) faces the same job: turn CloudPDF connection options plus a document
 * reference into what the open-source viewer's engine-agnostic door already
 * takes — an engine factory and a `documents` list — while passing every other
 * option through untouched. That mapping lives here, so the brand vocabulary
 * has exactly one definition and each door stays a genuine shim.
 *
 * Deliberately tiny and framework-free: `cloudEngine` is the only static
 * runtime import, so a wrapper that uses this does not drag the CDN artifact
 * along. The local engine stamps need is imported on first use (see
 * `localAssetEngine`).
 */
import {
  cloudEngine,
  type CloudEngineOptions,
  type OpenInput,
  type TokenSource,
} from '@cloudpdf/engine';
import type {
  DocumentEntry as ViewerDocumentEntry,
  EngineFactory,
  ViewerConfig as EngineViewerConfig,
  ViewerPluginsConfig,
} from '@embedpdf/viewer/core';

/**
 * A CloudPDF document, in the three ways the engine opens one: with a document token your
 * backend creates for the user, which names the document; by its id, which the engine's
 * `token` (or this one) must allow; or with a share link from the dashboard (`shr_…`), with
 * its passphrase when it has one. A token is a string, or a function that gives a fresh one
 * when the old one runs out.
 */
export type DocumentSrc =
  | { readonly token: TokenSource }
  | { readonly id: string; readonly token?: TokenSource }
  | { readonly shareToken: string; readonly sharePassword?: string };

/** One of the documents `documents` opens, each in a tab of its own. */
export type DocumentEntry = ViewerDocumentEntry<DocumentSrc>;

/** The cloud connection, and the documents it opens. */
export interface CloudSource extends CloudEngineOptions {
  /** One document: `{ token }`, `{ id }` or `{ shareToken }`. Follows its prop: another one
   *  opens in its place, and `null` closes it. */
  src?: DocumentSrc | null;
  /** Several documents, each in a tab, with their names, passwords and the one that shows
   *  first. With these, `src` is ignored. Read once. */
  documents?: readonly DocumentEntry[];
  /** Each plugin's settings, exactly as the open-source viewer takes them, except that
   *  `stamp.assetEngine` defaults to a local engine loaded on first use. */
  plugins?: ViewerPluginsConfig;
}

/**
 * The cloud viewer's config: every key of the viewer's, with the engine and the documents named
 * in the cloud's words. The document's token says who the user is and what they may do, so
 * there is no `scope` or `identity` here.
 */
export interface ViewerConfig
  extends
    Omit<EngineViewerConfig, 'engine' | 'src' | 'documents' | 'scope' | 'identity'>,
    CloudSource {}

/** What the cloud engine opens for a `src`: `{ kind: 'token' }`, `{ kind: 'id' }` or `{ kind: 'share' }`. */
function openInputOf(src: DocumentSrc): OpenInput {
  if ('shareToken' in src) {
    return {
      kind: 'share',
      shareToken: src.shareToken,
      ...(src.sharePassword !== undefined ? { sharePassword: src.sharePassword } : {}),
    };
  }
  if ('id' in src) {
    return { kind: 'id', id: src.id, ...(src.token !== undefined ? { token: src.token } : {}) };
  }
  return { kind: 'token', token: src.token };
}

/**
 * The engine stamp libraries and signature marks open in. The cloud engine
 * renders the pages, but a stamp library is a PDF that is cut into stamps and
 * previewed in the browser, which takes a local engine. It is imported the
 * first time someone opens Stamps or Signatures, so a viewer that never does
 * never downloads the wasm.
 */
const localAssetEngine = () => import('@embedpdf/engine').then((engine) => engine.localEngine());

/**
 * Split cloud options into the engine seam, the documents, and
 * everything else — so a door is one call:
 *
 * ```ts
 * EmbedPDF.init(resolveCloudConfig(options));         // vanilla
 * <PDFViewer {...resolveCloudConfig(props)} />        // react
 * ```
 *
 * The engine comes back as a thunk, which is what gives the viewer ownership of
 * its lifetime: created on mount, destroyed on unmount. `plugins` comes back
 * with a local `plugins.stamp.assetEngine` unless you named one.
 *
 * `src` and each entry of `documents` come back as what the engine opens
 * (`openInputOf`), which the viewer opens as it is; `src` still follows its
 * prop. The cloud engine resolves a share link itself (exchange, renewal,
 * revocation-at-renewal).
 *
 * The return type is deliberately inferred. The destructuring below is the only
 * statement of what this module consumes, so what passes through in `rest` and
 * what the type says passes through are the same fact and cannot drift. Writing
 * the type by hand needs a second list of the same keys, and a second list is
 * the thing that goes stale.
 */
export function resolveCloudConfig<T extends CloudSource>(options: T) {
  const {
    baseUrl,
    token,
    fetch: fetchFn,
    docAffinityHeader,
    onRetry,
    src,
    documents,
    plugins,
    ...rest
  } = options;

  // Every engine option, so none falls through to the viewer, where nothing reads it: an option
  // the engine adds and this leaves out is a type error here.
  const engineOptions = {
    baseUrl,
    token,
    fetch: fetchFn,
    docAffinityHeader,
    onRetry,
  } satisfies CloudEngineOptions & Record<keyof CloudEngineOptions, unknown>;
  const engine: EngineFactory = () => cloudEngine(engineOptions);

  return {
    ...rest,
    engine,
    ...(src !== undefined ? { src: src && openInputOf(src) } : {}),
    ...(documents !== undefined
      ? { documents: documents.map((entry) => ({ ...entry, src: openInputOf(entry.src) })) }
      : {}),
    plugins: { ...plugins, stamp: { assetEngine: localAssetEngine, ...plugins?.stamp } },
  };
}
