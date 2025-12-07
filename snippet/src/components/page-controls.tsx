import { h } from 'preact';
import { useViewportCapability } from '@embedpdf/plugin-viewport/preact';
import { useScroll } from '@embedpdf/plugin-scroll/preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { ChevronLeftIcon } from './icons/chevron-left';
import { ChevronRightIcon } from './icons/chevron-right';

type PageControlsProps = {
  documentId: string;
};

export function PageControls({ documentId }: PageControlsProps) {
  const { provides: viewport } = useViewportCapability();
  const {
    provides: scroll,
    state: { currentPage, totalPages },
  } = useScroll(documentId);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputValue, setInputValue] = useState<string>(currentPage.toString());

  useEffect(() => {
    setInputValue(currentPage.toString());
  }, [currentPage]);

  const startHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      if (!isHovering) {
        setIsVisible(false);
      }
    }, 4000);
  }, [isHovering]);

  useEffect(() => {
    if (!viewport) return;

    return viewport.onScrollActivity((activity) => {
      if (activity.documentId === documentId) {
        setIsVisible(true);
        startHideTimer();
      }
    });
  }, [viewport, documentId, startHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    setIsHovering(true);
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    startHideTimer();
  };

  const handlePageChange = (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const pageStr = formData.get('page') as string;
    const page = parseInt(pageStr);

    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      scroll?.scrollToPage?.({
        pageNumber: page,
      });
    }
  };

  const handlePreviousPage = (e: MouseEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).blur();
    if (currentPage > 1) {
      scroll?.scrollToPreviousPage();
    }
  };

  const handleNextPage = (e: MouseEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).blur();
    if (currentPage < totalPages) {
      scroll?.scrollToNextPage();
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 p-1 shadow-lg">
        {/* Previous Button */}
        <button
          onClick={handlePreviousPage}
          disabled={currentPage === 1}
          className="rounded p-1 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        {/* Page Input */}
        <form onSubmit={handlePageChange} className="flex items-center gap-2">
          <input
            type="text"
            name="page"
            value={inputValue}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
              setInputValue(value);
            }}
            className="h-7 w-10 rounded border border-gray-300 bg-white px-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">{totalPages}</span>
        </form>

        {/* Next Button */}
        <button
          onClick={handleNextPage}
          disabled={currentPage === totalPages}
          className="rounded p-1 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
          aria-label="Next page"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
