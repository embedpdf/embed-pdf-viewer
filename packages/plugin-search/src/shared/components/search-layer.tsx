import { useEffect, useMemo, useState, HTMLAttributes, CSSProperties } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { SearchResultState } from '@embedpdf/plugin-search';

import { useSearchCapability } from '../hooks';

type SearchLayoutProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  scale?: number;
  highlightColor?: string;
  activeHighlightColor?: string;
  style?: CSSProperties;
};

export function SearchLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  style,
  highlightColor = '#FFFF00',
  activeHighlightColor = '#FFBF00',
  ...props
}: SearchLayoutProps) {
  const { provides: searchProvides } = useSearchCapability();
  const [searchResultState, setSearchResultState] = useState<SearchResultState | null>(null);
  const documentState = useDocumentState(documentId);

  const scope = useMemo(
    () => searchProvides?.forDocument(documentId),
    [searchProvides, documentId],
  );

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  useEffect(() => {
    if (!scope) {
      setSearchResultState(null);
      return;
    }
    // Set initial state
    const currentState = scope.getState();
    setSearchResultState({
      results: currentState.results,
      activeResultIndex: currentState.activeResultIndex,
      showAllResults: currentState.showAllResults,
      active: currentState.active,
    });
    // Subscribe to changes
    return scope.onSearchResultStateChange((state) => {
      setSearchResultState(state);
    });
  }, [scope]);

  if (!searchResultState || !searchResultState.active) {
    return null;
  }

  // Filter results for current page while preserving original indices
  const pageResults = searchResultState.results
    .map((result, originalIndex) => ({ result, originalIndex }))
    .filter(({ result }) => result.pageIndex === pageIndex);

  // Decide which results to show
  const resultsToShow = pageResults.filter(
    ({ originalIndex }) =>
      searchResultState.showAllResults || originalIndex === searchResultState.activeResultIndex,
  );

  return (
    <div
      style={{
        ...style,
        pointerEvents: 'none',
      }}
      {...props}
    >
      {resultsToShow.map(({ result, originalIndex }) =>
        result.rects.map((rect, rectIndex) => (
          <div
            key={`${originalIndex}-${rectIndex}`}
            style={{
              position: 'absolute',
              top: rect.origin.y * actualScale,
              left: rect.origin.x * actualScale,
              width: rect.size.width * actualScale,
              height: rect.size.height * actualScale,
              backgroundColor:
                originalIndex === searchResultState.activeResultIndex
                  ? activeHighlightColor
                  : highlightColor,
              mixBlendMode: 'multiply',
              transform: 'scale(1.02)',
              transformOrigin: 'center',
              transition: 'opacity .3s ease-in-out',
              opacity: 1,
            }}
          ></div>
        )),
      )}
    </div>
  );
}
