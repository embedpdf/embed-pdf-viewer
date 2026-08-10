/**
 * @cloudpdf/engine - Engine v3 cloud client.
 *
 * Implements the same {@link Engine} interface as `@embedpdf/engine` but
 * routes calls to a remote `@cloudpdf/server` over HTTP. Same observable
 * contract: {@link AbortablePromise}-based, EngineError-coded, parity-tested
 * with `runMetadataConformance`.
 */
export { CloudEngine } from './CloudEngine';
export type { CloudEngineOptions } from './CloudEngine';
export { CloudDocumentHandle } from './document/CloudDocumentHandle';
export { CloudMetadataService } from './document/CloudMetadataService';
export { CloudDocumentAnnotationsService } from './document/CloudDocumentAnnotationsService';
export { CloudDocumentPagesService } from './document/CloudDocumentPagesService';
export { CloudPageHandle } from './document/CloudPageHandle';
export { CloudPageAnnotationsService } from './document/CloudPageAnnotationsService';
export { CloudPageGeometryService } from './document/CloudPageGeometryService';
export { CloudPageRenderService } from './document/CloudPageRenderService';
export { HttpClient } from './transport/HttpClient';
export type { HttpClientOptions } from './transport/HttpClient';
export { decodeUnverifiedClaims } from './transport/decodeUnverifiedClaims';
export type { UnverifiedClaims } from './transport/decodeUnverifiedClaims';
export { exchangeShareToken, shareSessionSource, ShareExchangeError } from './share';
export type { ShareSession, ShareExchangeOptions } from './share';

import { CloudEngine, type CloudEngineOptions } from './CloudEngine';

export function createCloudEngine(opts: CloudEngineOptions): CloudEngine {
  return CloudEngine.fromOptions(opts);
}

/**
 * Create a cloud {@link CloudEngine} — the drop-in counterpart of
 * `localEngine()`, so swapping local for cloud is a one-import change.
 *
 * Synchronous and cheap: no WASM to compile, no worker to spawn — the engine
 * holds an HTTP client and nothing else. Like `localEngine()`, the returned
 * instance is yours (call `destroy()` when done, usually never for a
 * module-scope singleton); pass a thunk (`engine={() => cloudEngine(...)}`)
 * to let a `<Viewer>` own the lifetime instead.
 *
 * Note the deliberate asymmetry with `localEngine()`: there is no `fonts`
 * option. Fallback fonts are a SERVER policy on the cloud (`Engine.fonts` is
 * `undefined` cloud-side), so they cannot be configured from the client. This
 * is the local-vs-cloud split, surfaced in the API.
 *
 * ```ts
 * const engine = cloudEngine({ baseUrl: 'https://pdf.example.com', token });
 * <Viewer engine={engine} plugins={[stagePlugin(), renderPlugin()]} />
 * ```
 */
export function cloudEngine(opts: CloudEngineOptions): CloudEngine {
  return CloudEngine.fromOptions(opts);
}

// Re-export the shared engine runtime surface so consumers import every
// public type and primitive from a single `@cloudpdf/engine` entrypoint
// instead of reaching into the transitive `@embedpdf/engine-core` dep.
export {
  AbortablePromise,
  AbortError,
  EngineError,
  EngineErrorCode,
} from '@embedpdf/engine-core/runtime';
export type {
  Engine,
  EngineFactory,
  DocumentHandle,
  DocumentCapabilities,
  PageHandle,
  OpenInput,
  OpenOptions,
  TokenSource,
  MetadataService,
  DocumentPagesService,
  DocumentAnnotationsService,
  PageAnnotationsService,
  PageTextService,
  PageGeometryService,
  PageRenderService,
  DocumentSecurityService,
  DocumentSecurityState,
  DocumentUnlockInput,
  DocumentUnlockResult,
  DocumentAccessInfo,
  DocumentIdentity,
  PdfSaveMode,
} from '@embedpdf/engine-core/runtime';
