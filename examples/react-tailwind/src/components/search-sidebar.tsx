import { useSearch } from '@embedpdf/plugin-search/react';
import { useScrollCapability } from '@embedpdf/plugin-scroll/react';
import { useState, useRef, useEffect } from 'react';
import { MatchFlag } from '@embedpdf/models';
import { SearchResult } from '@embedpdf/models';
import { SearchIcon, CloseIcon, ChevronRightIcon, ChevronLeftIcon } from './icons';

const HitLine = ({
  hit,
  onClick,
  active,
}: {
  hit: SearchResult;
  onClick: () => void;
  active: boolean;
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [active]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`w-full rounded border p-2 text-left text-sm transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-900'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span>
        {hit.context.truncatedLeft && '… '}
        {hit.context.before}
        <span className="font-bold text-blue-600">{hit.context.match}</span>
        {hit.context.after}
        {hit.context.truncatedRight && ' …'}
      </span>
    </button>
  );
};

type SearchSidebarProps = {
  documentId: string;
  onClose: () => void;
};

export function SearchSidebar({ documentId, onClose }: SearchSidebarProps) {
  const { state, provides } = useSearch(documentId);
  const { provides: scroll } = useScrollCapability();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Sync inputValue with persisted state.query when state loads
  useEffect(() => {
    setInputValue(state.query || '');
  }, [state.query, documentId]); // Include documentId to reset on tab change

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [provides]);

  useEffect(() => {
    if (state.activeResultIndex !== undefined && state.activeResultIndex >= 0 && !state.loading) {
      scrollToItem(state.activeResultIndex);
    }
  }, [state.activeResultIndex, state.loading, state.query, state.flags]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Trigger search immediately on user input
    if (value === '') {
      provides?.stopSearch();
    } else {
      provides?.searchAllPages(value);
    }
  };

  const handleFlagChange = (flag: MatchFlag, checked: boolean) => {
    if (checked) {
      provides?.setFlags([...state.flags, flag]);
    } else {
      provides?.setFlags(state.flags.filter((f) => f !== flag));
    }
  };

  const clearInput = () => {
    setInputValue('');
    provides?.stopSearch();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const scrollToItem = (index: number) => {
    const item = state.results[index];
    if (!item) return;

    const minCoordinates = item.rects.reduce(
      (min, rect) => ({
        x: Math.min(min.x, rect.origin.x),
        y: Math.min(min.y, rect.origin.y),
      }),
      { x: Infinity, y: Infinity },
    );

    scroll?.scrollToPage({
      pageNumber: item.pageIndex + 1,
      pageCoordinates: minCoordinates,
      center: true,
    });
  };

  const groupByPage = (results: typeof state.results) => {
    return results.reduce<Record<number, { hit: (typeof results)[0]; index: number }[]>>(
      (map, r, i) => {
        (map[r.pageIndex] ??= []).push({ hit: r, index: i });
        return map;
      },
      {},
    );
  };

  if (!provides) return null;

  const grouped = groupByPage(state.results);

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-300 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-800">Search</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close search"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="border-b border-gray-200 p-4">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <SearchIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search"
            value={inputValue}
            onChange={handleInputChange}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {inputValue && (
            <button
              onClick={clearInput}
              className="absolute inset-y-0 right-0 flex items-center pr-3"
            >
              <CloseIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Options */}
        <div className="mt-3 space-y-2">
          <label className="flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={state.flags.includes(MatchFlag.MatchCase)}
              onChange={(e) => handleFlagChange(MatchFlag.MatchCase, e.target.checked)}
              className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Case sensitive
          </label>
          <label className="flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={state.flags.includes(MatchFlag.MatchWholeWord)}
              onChange={(e) => handleFlagChange(MatchFlag.MatchWholeWord, e.target.checked)}
              className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Whole word
          </label>
        </div>

        {/* Results count and navigation */}
        {state.active && !state.loading && state.total > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">{state.total} results found</span>
            {state.total > 1 && (
              <div className="flex gap-1">
                <button
                  onClick={() => provides.previousResult()}
                  className="rounded p-1 text-gray-600 hover:bg-gray-100"
                  aria-label="Previous result"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => provides.nextResult()}
                  className="rounded p-1 text-gray-600 hover:bg-gray-100"
                  aria-label="Next result"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        {state.loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([page, hits]) => (
              <div key={page}>
                <div className="mb-2 text-xs font-semibold text-gray-500">
                  Page {Number(page) + 1}
                </div>
                <div className="space-y-2">
                  {hits.map(({ hit, index }) => (
                    <HitLine
                      key={index}
                      hit={hit}
                      active={index === state.activeResultIndex}
                      onClick={() => provides.goToResult(index)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
