/**
 * `@embedpdf/docs-kit/search` — the server/build half of docs search.
 *
 * Node-only (filesystem, crypto): imported by site build scripts and the
 * `/api/search` route, never by client components. The dialog lives on the
 * kit root export; the types it shares with this stack are dependency-free.
 */

export {
  HIGHLIGHT_CLOSE,
  HIGHLIGHT_OPEN,
  type DocsSearchHit,
  type DocsSearchResponse,
  type DocsSection,
} from './types';
export { extractPageSections, type ExtractPageOptions, type SearchExtractSite } from './extract';
export {
  collectCorpus,
  contentHashFor,
  contentPathFor,
  embeddingTextFor,
  sectionId,
  symbolsTextFor,
  variantProseTextFor,
  type CorpusPage,
} from './corpus';
export { dedupeSymbols, symbolsFromCode, symbolsFromInlineCode } from './symbols';
export { normalizeQuery, queryTerms } from './terms';
export {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embedQuery,
  embedTexts,
  isEmbeddingConfigured,
} from './embed';
export {
  loadSearchArtifact,
  writeSearchArtifact,
  SEARCH_ARTIFACT_VERSION,
  type LoadedSearchArtifact,
  type SearchArtifactMeta,
  type SearchArtifactSection,
} from './artifact';
export { makeExcerpt } from './excerpt';
export {
  loadSearchIndex,
  searchIndex,
  type SearchIndexData,
  type SearchIndexOptions,
} from './query';
export {
  buildSearchArtifact,
  type BuildSearchArtifactOptions,
  type BuildSearchArtifactResult,
} from './build';
export { createDocsSearchRoute, type DocsSearchRouteConfig } from './route';
