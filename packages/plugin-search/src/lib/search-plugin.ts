import { BasePlugin, createBehaviorEmitter, Listener, PluginRegistry } from '@embedpdf/core';
import {
  MatchFlag,
  SearchAllPagesResult,
  PdfEngine,
  PdfTask,
  PdfPageSearchProgress,
  PdfTaskHelper,
  PdfErrorCode,
} from '@embedpdf/models';
import {
  SearchPluginConfig,
  SearchCapability,
  SearchState,
  SearchResultState,
  SearchScope,
  SearchResultEvent,
  SearchStartEvent,
  SearchStopEvent,
  ActiveResultChangeEvent,
  SearchResultStateEvent,
  SearchStateEvent,
  SearchDocumentState,
} from './types';
import {
  startSearchSession,
  stopSearchSession,
  setSearchFlags,
  setShowAllResults,
  startSearch,
  setSearchResults,
  setActiveResultIndex,
  appendSearchResults,
  SearchAction,
  initSearchState,
  cleanupSearchState,
} from './actions';
import { initialSearchDocumentState } from './reducer';

export class SearchPlugin extends BasePlugin<
  SearchPluginConfig,
  SearchCapability,
  SearchState,
  SearchAction
> {
  static readonly id = 'search' as const;

  // Event emitters are now global and include documentId
  private readonly searchStop$ = createBehaviorEmitter<SearchStopEvent>();
  private readonly searchStart$ = createBehaviorEmitter<SearchStartEvent>();
  private readonly searchResult$ = createBehaviorEmitter<SearchResultEvent>();
  private readonly searchActiveResultChange$ = createBehaviorEmitter<ActiveResultChangeEvent>();
  private readonly searchResultState$ = createBehaviorEmitter<SearchResultStateEvent>();
  private readonly searchState$ = createBehaviorEmitter<SearchStateEvent>();

  // Keep reference to current running tasks per document
  private currentTask = new Map<string, ReturnType<PdfEngine['searchAllPages']>>();
  private pluginConfig: SearchPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: SearchPluginConfig) {
    super(id, registry);
    this.pluginConfig = config;
    // We no longer need to listen to the loader.
    // Document lifecycle is handled by BasePlugin hooks.
  }

  protected override onDocumentLoadingStarted(documentId: string): void {
    const initialState = {
      ...initialSearchDocumentState,
      flags: this.pluginConfig.flags || [],
      showAllResults: this.pluginConfig.showAllResults ?? true,
    };
    this.dispatch(initSearchState(documentId, initialState));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.stopSearchSession(documentId); // Ensure any running search is stopped
    this.dispatch(cleanupSearchState(documentId));
    this.currentTask.delete(documentId);
  }

  async initialize(): Promise<void> {
    // Config is now handled in onDocumentLoadingStarted
  }

  override onStoreUpdated(prevState: SearchState, newState: SearchState): void {
    for (const documentId in newState.documents) {
      const prevDocState = prevState.documents[documentId];
      const newDocState = newState.documents[documentId];

      if (prevDocState !== newDocState) {
        // Emit per-document state
        this.searchState$.emit({ documentId, state: newDocState });

        // Emit reactive result state
        if (
          !prevDocState ||
          prevDocState.results !== newDocState.results ||
          prevDocState.activeResultIndex !== newDocState.activeResultIndex ||
          prevDocState.showAllResults !== newDocState.showAllResults ||
          prevDocState.active !== newDocState.active
        ) {
          this.searchResultState$.emit({
            documentId,
            state: {
              results: newDocState.results,
              activeResultIndex: newDocState.activeResultIndex,
              showAllResults: newDocState.showAllResults,
              active: newDocState.active,
            },
          });
        }
      }
    }
  }

  protected buildCapability(): SearchCapability {
    const getDocId = (documentId?: string) => documentId ?? this.getActiveDocumentId();
    const getDocState = (docId?: string) => {
      const id = getDocId(docId);
      const state = this.state.documents[id];
      if (!state) throw new Error(`Search state not found for document ${id}`);
      return state;
    };

    return {
      startSearch: (docId) => this.startSearchSession(getDocId(docId)),
      stopSearch: (docId) => this.stopSearchSession(getDocId(docId)),
      searchAllPages: (keyword, docId) => this.searchAllPages(keyword, getDocId(docId)),
      nextResult: (docId) => this.nextResult(getDocId(docId)),
      previousResult: (docId) => this.previousResult(getDocId(docId)),
      goToResult: (index, docId) => this.goToResult(index, getDocId(docId)),
      setShowAllResults: (showAll, docId) =>
        this.dispatch(setShowAllResults(getDocId(docId), showAll)),
      getShowAllResults: (docId) => getDocState(docId).showAllResults,
      getFlags: (docId) => getDocState(docId).flags,
      setFlags: (flags, docId) => this.setFlags(flags, getDocId(docId)),
      getState: (docId) => getDocState(docId),
      forDocument: this.createSearchScope.bind(this),
      onSearchResult: this.searchResult$.on,
      onSearchStart: this.searchStart$.on,
      onSearchStop: this.searchStop$.on,
      onActiveResultChange: this.searchActiveResultChange$.on,
      onSearchResultStateChange: this.searchResultState$.on,
      onStateChange: this.searchState$.on,
    };
  }

  private createSearchScope(documentId: string): SearchScope {
    const getDocState = () => {
      const state = this.state.documents[documentId];
      if (!state) throw new Error(`Search state not found for document ${documentId}`);
      return state;
    };

    return {
      startSearch: () => this.startSearchSession(documentId),
      stopSearch: () => this.stopSearchSession(documentId),
      searchAllPages: (keyword) => this.searchAllPages(keyword, documentId),
      nextResult: () => this.nextResult(documentId),
      previousResult: () => this.previousResult(documentId),
      goToResult: (index) => this.goToResult(index, documentId),
      setShowAllResults: (showAll) => this.dispatch(setShowAllResults(documentId, showAll)),
      getShowAllResults: () => getDocState().showAllResults,
      getFlags: () => getDocState().flags,
      setFlags: (flags) => this.setFlags(flags, documentId),
      getState: getDocState,
      onSearchResult: (listener: Listener<SearchAllPagesResult>) =>
        this.searchResult$.on((event) => {
          if (event.documentId === documentId) listener(event.results);
        }),
      onSearchStart: (listener: Listener<void>) =>
        this.searchStart$.on((event) => {
          if (event.documentId === documentId) listener();
        }),
      onSearchStop: (listener: Listener<void>) =>
        this.searchStop$.on((event) => {
          if (event.documentId === documentId) listener();
        }),
      onActiveResultChange: (listener: Listener<number>) =>
        this.searchActiveResultChange$.on((event) => {
          if (event.documentId === documentId) listener(event.index);
        }),
      onSearchResultStateChange: (listener: Listener<SearchResultState>) =>
        this.searchResultState$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
      onStateChange: (listener: Listener<SearchDocumentState>) =>
        this.searchState$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
    };
  }

  private setFlags(flags: MatchFlag[], documentId: string): void {
    this.dispatch(setSearchFlags(documentId, flags));
    const docState = this.state.documents[documentId];
    if (docState?.active) {
      this.searchAllPages(docState.query, documentId, true);
    }
  }

  private notifySearchStart(documentId: string): void {
    this.searchStart$.emit({ documentId });
  }

  private notifySearchStop(documentId: string): void {
    this.searchStop$.emit({ documentId });
  }

  private notifyActiveResultChange(documentId: string, index: number): void {
    this.searchActiveResultChange$.emit({ documentId, index });
  }

  private startSearchSession(documentId: string): void {
    const coreDoc = this.getCoreDocument(documentId);
    if (!coreDoc) return;
    this.dispatch(startSearchSession(documentId));
    this.notifySearchStart(documentId);
  }

  private stopSearchSession(documentId: string): void {
    const docState = this.state.documents[documentId];
    if (!docState?.active) return;

    const task = this.currentTask.get(documentId);
    if (task) {
      try {
        task.abort?.({ code: PdfErrorCode.Cancelled, message: 'search stopped' });
      } catch {}
      this.currentTask.delete(documentId);
    }

    this.dispatch(stopSearchSession(documentId));
    this.notifySearchStop(documentId);
  }

  private searchAllPages(
    keyword: string,
    documentId: string,
    force: boolean = false,
  ): PdfTask<SearchAllPagesResult, PdfPageSearchProgress> {
    const docState = this.state.documents[documentId];
    if (!docState) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Search state not initialized',
      });
    }
    const coreDoc = this.getCoreDocument(documentId);
    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not loaded' });
    }

    const trimmedKeyword = keyword.trim();

    if (docState.query === trimmedKeyword && !force) {
      return PdfTaskHelper.resolve<SearchAllPagesResult, PdfPageSearchProgress>({
        results: docState.results,
        total: docState.total,
      });
    }

    // stop previous task if still running
    const oldTask = this.currentTask.get(documentId);
    if (oldTask) {
      try {
        oldTask.abort?.({ code: PdfErrorCode.Cancelled, message: 'new search' });
      } catch {}
      this.currentTask.delete(documentId);
    }

    this.dispatch(startSearch(documentId, trimmedKeyword));

    if (!trimmedKeyword) {
      this.dispatch(setSearchResults(documentId, [], 0, -1));
      return PdfTaskHelper.resolve<SearchAllPagesResult, PdfPageSearchProgress>({
        results: [],
        total: 0,
      });
    }

    if (!docState.active) {
      this.startSearchSession(documentId);
    }

    const task = this.engine.searchAllPages(coreDoc.document, trimmedKeyword, {
      flags: docState.flags,
    });
    this.currentTask.set(documentId, task);

    task.onProgress((p) => {
      if (p?.results?.length) {
        // Check if the task is still the current one before dispatching
        if (this.currentTask.get(documentId) === task) {
          this.dispatch(appendSearchResults(documentId, p.results));
          // set first active result as soon as we have something
          if (this.state.documents[documentId].activeResultIndex === -1) {
            this.dispatch(setActiveResultIndex(documentId, 0));
            this.notifyActiveResultChange(documentId, 0);
          }
        }
      }
    });

    task.wait(
      (results) => {
        this.currentTask.delete(documentId);
        const activeResultIndex = results.total > 0 ? 0 : -1;
        this.dispatch(
          setSearchResults(documentId, results.results, results.total, activeResultIndex),
        );
        this.searchResult$.emit({ documentId, results });
        if (results.total > 0) {
          this.notifyActiveResultChange(documentId, 0);
        }
      },
      (error) => {
        // Only clear results if the error wasn't an abort
        if (error?.reason?.code !== PdfErrorCode.Cancelled) {
          console.error('Error during search:', error);
          this.dispatch(setSearchResults(documentId, [], 0, -1));
        }
        this.currentTask.delete(documentId);
      },
    );

    return task;
  }

  private nextResult(documentId: string): number {
    const docState = this.state.documents[documentId];
    if (!docState || docState.results.length === 0) return -1;
    const nextIndex =
      docState.activeResultIndex >= docState.results.length - 1
        ? 0
        : docState.activeResultIndex + 1;
    return this.goToResult(nextIndex, documentId);
  }

  private previousResult(documentId: string): number {
    const docState = this.state.documents[documentId];
    if (!docState || docState.results.length === 0) return -1;
    const prevIndex =
      docState.activeResultIndex <= 0
        ? docState.results.length - 1
        : docState.activeResultIndex - 1;
    return this.goToResult(prevIndex, documentId);
  }

  private goToResult(index: number, documentId: string): number {
    const docState = this.state.documents[documentId];
    if (
      !docState ||
      docState.results.length === 0 ||
      index < 0 ||
      index >= docState.results.length
    ) {
      return -1;
    }
    this.dispatch(setActiveResultIndex(documentId, index));
    this.notifyActiveResultChange(documentId, index);
    return index;
  }

  async destroy(): Promise<void> {
    for (const documentId of Object.keys(this.state.documents)) {
      this.stopSearchSession(documentId);
    }
    this.searchResult$.clear();
    this.searchStart$.clear();
    this.searchStop$.clear();
    this.searchActiveResultChange$.clear();
    this.searchResultState$.clear();
    this.searchState$.clear();
    super.destroy();
  }
}
