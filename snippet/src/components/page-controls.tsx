import { h } from 'preact';
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { useScroll } from '@embedpdf/plugin-scroll/preact';
import { useViewportCapability } from '@embedpdf/plugin-viewport/preact';
import { ChevronLeftIcon } from './icons/chevron-left';
import { ChevronRightIcon } from './icons/chevron-right';

interface PageControlsProps {
  documentId: string;
}

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
  const inputRef = useRef<HTMLInputElement>(null);

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
    // Clear any pending hide timer
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    startHideTimer();
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      scroll?.scrollToPreviousPage();
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      scroll?.scrollToNextPage();
    }
  };

  const handleInputChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    setInputValue(value);
  };

  const handleInputFocus = () => {
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleInputBlur = () => {
    const page = parseInt(inputValue, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      scroll?.scrollToPage?.({ pageNumber: page });
    } else {
      setInputValue(currentPage.toString());
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setInputValue(currentPage.toString());
      (e.target as HTMLInputElement).blur();
    }
  };

  if (totalPages <= 1) {
    return null;
  }

  // Button styles matching toolbar buttons
  const buttonBaseClass =
    'flex h-[32px] w-[32px] items-center justify-center rounded-md transition-colors cursor-pointer';
  const buttonHoverClass = 'hover:bg-interactive-hover hover:ring hover:ring-accent';
  const buttonDisabledClass =
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:ring-0';

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="pointer-events-auto"
    >
      <div
        className={`border-border-default bg-bg-surface flex items-center gap-1 rounded-lg border p-1 shadow-lg transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Previous Button */}
        <button
          onClick={handlePreviousPage}
          disabled={currentPage <= 1}
          className={`${buttonBaseClass} ${buttonHoverClass} ${buttonDisabledClass} text-fg-secondary`}
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        {/* Page Input */}
        <div className="flex items-center gap-1 px-1">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent h-7 w-10 rounded border px-1 text-center text-sm focus:outline-none focus:ring-1"
          />
          <span className="text-fg-secondary text-sm">&nbsp; {totalPages}</span>
        </div>

        {/* Next Button */}
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          className={`${buttonBaseClass} ${buttonHoverClass} ${buttonDisabledClass} text-fg-secondary`}
          aria-label="Next page"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
