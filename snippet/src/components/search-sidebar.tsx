import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { useSearch } from '@embedpdf/plugin-search/preact';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { MatchFlag, SearchResult } from '@embedpdf/models';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { useDebounce } from '../hooks/use-debounce';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { XIcon } from './icons/x';
import { ChevronRightIcon } from './icons/chevron-right';
import { ChevronLeftIcon } from './icons/chevron-left';
import { SearchIcon } from './icons/search';

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
  onClose?: () => void;
};

export function SearchSidebar({ documentId, onClose }: SearchSidebarProps) {
  const { state, provides } = useSearch(documentId);
  const { provides: scroll } = useScrollCapability();
  const { translate } = useTranslations(documentId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Focus input on mount
  useEffect(() => {
    //inputRef.current?.focus();
  }, []);

  // Sync inputValue with persisted state.query when state loads
  useEffect(() => {
    if (state.query && !inputValue) {
      setInputValue(state.query);
    }
  }, [state.query]);

  useEffect(() => {
    if (state.activeResultIndex !== undefined && state.activeResultIndex >= 0 && !state.loading) {
      scrollToItem(state.activeResultIndex);
    }
  });

  const debouncedValue = useDebounce(inputValue, 300);

  useEffect(() => {
    if (debouncedValue !== state.query) {
      provides?.searchAllPages(debouncedValue);
    }
  }, [debouncedValue, provides, state.query]);

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setInputValue(target.value);
  };

  const handleFlagChange = (flag: MatchFlag, checked: boolean) => {
    if (checked) {
      provides?.setFlags([...state.flags, flag]);
    } else {
      provides?.setFlags(state.flags.filter((f) => f !== flag));
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

    scroll?.forDocument(documentId)?.scrollToPage({
      pageNumber: item.pageIndex + 1,
      pageCoordinates: minCoordinates,
      alignX: 50,
      alignY: 25,
    });
  };

  const clearInput = () => {
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const groupByPage = (
    results: SearchResult[],
  ): Record<number, { hit: SearchResult; index: number }[]> => {
    const grouped: Record<number, { hit: SearchResult; index: number }[]> = {};
    results.forEach((hit, index) => {
      if (!grouped[hit.pageIndex]) {
        grouped[hit.pageIndex] = [];
      }
      grouped[hit.pageIndex].push({ hit, index });
    });
    return grouped;
  };

  const grouped = groupByPage(state.results);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="p-4">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
            <SearchIcon className="h-4 w-4 text-gray-500" />
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder={translate('search.placeholder')}
            value={inputValue}
            onInput={handleInputChange}
            className="w-full rounded-md border border-gray-300 py-1 pl-8 pr-9 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {inputValue && (
            <div
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3"
              onClick={clearInput}
            >
              <XIcon className="h-4 w-4 text-gray-500 hover:text-gray-700" />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-row gap-4">
          <Checkbox
            label={translate('search.caseSensitive')}
            checked={state.flags.includes(MatchFlag.MatchCase)}
            onChange={(checked) => handleFlagChange(MatchFlag.MatchCase, checked)}
          />
          <Checkbox
            label={translate('search.wholeWord')}
            checked={state.flags.includes(MatchFlag.MatchWholeWord)}
            onChange={(checked) => handleFlagChange(MatchFlag.MatchWholeWord, checked)}
          />
        </div>
        <hr className="mb-2 mt-5 border-gray-200" />
        {state.active && (
          <div className="flex h-[32px] flex-row items-center justify-between">
            <div className="text-xs text-gray-500">
              {translate('search.resultsFound', { params: { count: state.total } })}
            </div>
            {state.total > 1 && (
              <div className="flex flex-row">
                <Button
                  onClick={() => {
                    provides?.previousResult();
                  }}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => {
                    provides?.nextResult();
                  }}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4">
        {Object.entries(grouped).map(([page, hits]) => (
          <div key={page} className="mt-2 first:mt-0">
            <div className="bg-white/80 py-2 text-xs text-gray-500 backdrop-blur">
              {translate('search.page', { params: { page: Number(page) + 1 } })}
            </div>

            <div className="flex flex-col gap-2">
              {hits.map(({ hit, index }) => (
                <HitLine
                  key={index}
                  hit={hit}
                  active={index === state.activeResultIndex}
                  onClick={() => {
                    provides?.goToResult(index);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <div />
      </div>
    </div>
  );
}
