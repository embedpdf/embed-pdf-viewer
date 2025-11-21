import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  MatchFlag,
  SearchResult,
  SearchAllPagesResult,
  PdfTask,
  PdfPageSearchProgress,
} from '@embedpdf/models';

export interface SearchPluginConfig extends BasePluginConfig {
  flags?: MatchFlag[];
  /**
   * Whether to show all search results or only the active one
   * @default true
   */
  showAllResults?: boolean;
}

/**
 * This is the state for a *single* document
 */
export interface SearchDocumentState {
  flags: MatchFlag[];
  /**
   * Current search results from last search operation
   */
  results: SearchResult[];
  /**
   * Total number of search results
   */
  total: number;
  /**
   * Current active result index (0-based)
   */
  activeResultIndex: number;
  /**
   * Whether to show all search results or only the active one
   */
  showAllResults: boolean;
  /**
   * Current search query
   */
  query: string;
  /**
   * Whether a search operation is in progress
   */
  loading: boolean;
  /**
   * Whether search is currently active
   */
  active: boolean;
}

/**
 * This is the combined state for the plugin
 */
export interface SearchState {
  documents: Record<string, SearchDocumentState>;
}

/**
 * This is the payload for the reactive result state
 */
export interface SearchResultState {
  /**
   * Current search results from last search operation
   */
  results: SearchResult[];
  /**
   * Current active result index (0-based)
   */
  activeResultIndex: number;
  /**
   * Whether to show all search results or only the active one
   */
  showAllResults: boolean;
  /**
   * Whether search is currently active
   */
  active: boolean;
}

// ─────────────────────────────────────────────────────────
// Events (all payloads must include documentId)
// ─────────────────────────────────────────────────────────

export interface SearchResultEvent {
  documentId: string;
  results: SearchAllPagesResult;
}

export interface SearchStartEvent {
  documentId: string;
}

export interface SearchStopEvent {
  documentId: string;
}

export interface ActiveResultChangeEvent {
  documentId: string;
  index: number;
}

export interface SearchResultStateEvent {
  documentId: string;
  state: SearchResultState;
}

export interface SearchStateEvent {
  documentId: string;
  state: SearchDocumentState;
}

// ─────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────

export interface SearchScope {
  /**
   * Start a search session
   */
  startSearch: () => void;

  /**
   * Stop the active search session
   */
  stopSearch: () => void;

  /**
   * Search for all occurrences of the keyword throughout the document
   */
  searchAllPages: (keyword: string) => PdfTask<SearchAllPagesResult, PdfPageSearchProgress>;

  /**
   * Navigate to the next search result
   */
  nextResult: () => number;

  /**
   * Navigate to the previous search result
   */
  previousResult: () => number;

  /**
   * Go to a specific search result by index
   */
  goToResult: (index: number) => number;

  /**
   * Toggle visibility of all search results
   */
  setShowAllResults: (showAll: boolean) => void;

  /**
   * Get current state of search results visibility
   */
  getShowAllResults: () => boolean;

  /**
   * Get the current search flags
   */
  getFlags: () => MatchFlag[];

  /**
   * Set the search flags
   */
  setFlags: (flags: MatchFlag[]) => void;

  /**
   * Get the current search state
   */
  getState: () => SearchDocumentState;

  // Scoped Events (do not include documentId in payload)
  onSearchResult: EventHook<SearchAllPagesResult>;
  onSearchStart: EventHook<void>;
  onSearchStop: EventHook<void>;
  onActiveResultChange: EventHook<number>;
  onSearchResultStateChange: EventHook<SearchResultState>;
  onStateChange: EventHook<SearchDocumentState>;
}

export interface SearchCapability {
  // Active document operations
  startSearch: (documentId?: string) => void;
  stopSearch: (documentId?: string) => void;
  searchAllPages: (
    keyword: string,
    documentId?: string,
  ) => PdfTask<SearchAllPagesResult, PdfPageSearchProgress>;
  nextResult: (documentId?: string) => number;
  previousResult: (documentId?: string) => number;
  goToResult: (index: number, documentId?: string) => number;
  setShowAllResults: (showAll: boolean, documentId?: string) => void;
  getShowAllResults: (documentId?: string) => boolean;
  getFlags: (documentId?: string) => MatchFlag[];
  setFlags: (flags: MatchFlag[], documentId?: string) => void;
  getState: (documentId?: string) => SearchDocumentState;

  // Document-scoped operations
  forDocument(documentId: string): SearchScope;

  // Global Events (include documentId in payload)
  onSearchResult: EventHook<SearchResultEvent>;
  onSearchStart: EventHook<SearchStartEvent>;
  onSearchStop: EventHook<SearchStopEvent>;
  onActiveResultChange: EventHook<ActiveResultChangeEvent>;
  onSearchResultStateChange: EventHook<SearchResultStateEvent>;
  onStateChange: EventHook<SearchStateEvent>;
}
