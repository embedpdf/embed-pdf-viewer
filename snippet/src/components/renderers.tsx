import {
  Action,
  CommandMenuProps,
  ComponentRenderFunction,
  DividerComponent,
  FloatingComponentProps,
  Group,
  GroupedItemsProps,
  HeaderProps,
  IconButtonProps,
  Menu,
  MenuItem,
  PanelProps,
  ResolvedMenuItem,
  SelectButtonProps,
  TabButtonProps,
} from '@embedpdf/plugin-ui';
import { h, Fragment } from 'preact';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { useUICapability } from '@embedpdf/plugin-ui/preact';
import { Dropdown } from './ui/dropdown';
import { useZoomCapability } from '@embedpdf/plugin-zoom/preact';
import { useViewportCapability } from '@embedpdf/plugin-viewport/preact';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { Icon } from './ui/icon';
import { useSearchCapability } from '@embedpdf/plugin-search/preact';
import { ThumbImg, ThumbnailsPane } from '@embedpdf/plugin-thumbnail/preact';
import { useDebounce } from '@/hooks/use-debounce';
import {
  ignore,
  PdfAlphaColor,
  PdfAnnotationSubtype,
  PdfAttachmentObject,
  PdfBookmarkObject,
  PdfDocumentObject,
  PdfErrorCode,
  PdfPrintOptions,
  PdfZoomMode,
  Rotation,
  SearchAllPagesResult,
  SearchResult,
  WebAlphaColor,
} from '@embedpdf/models';
import { MatchFlag } from '@embedpdf/models';
import { Checkbox } from './ui/checkbox';
import { useSelectionCapability } from '@embedpdf/plugin-selection/preact';
import { menuPositionForSelection } from './utils';
import { useSwipeGesture } from '@/hooks/use-swipe-gesture';
import { Dialog } from './ui/dialog';
import { usePrintCapability } from '@embedpdf/plugin-print/preact';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/preact';
import { SidebarAnnotationEntry } from '@embedpdf/plugin-annotation';
import { useAttachmentCapability } from '@embedpdf/plugin-attachment/preact';

export const iconButtonRenderer: ComponentRenderFunction<IconButtonProps> = (
  { commandId, onClick, active, iconProps, disabled = false, ...props },
  children,
  context,
) => {
  const { provides: ui } = useUICapability();
  const command = commandId ? ui?.getMenuOrAction(commandId) : null;

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (onClick) {
        onClick();
        return;
      }

      if (!commandId || !ui || !command) return;

      // Get the button element to use for positioning menus
      const triggerElement = e.currentTarget as HTMLElement;

      ui.executeCommand(commandId, {
        source: 'click',
        triggerElement,
        position: context?.direction === 'horizontal' ? 'bottom' : 'right',
      });
    },
    [command, commandId, ui, onClick],
  );

  return (
    <Tooltip
      position={context?.direction === 'horizontal' ? 'bottom' : 'right'}
      content={props.label || command?.label || ''}
      trigger={active ? 'none' : 'hover'}
      delay={500}
    >
      <Button
        active={active}
        onClick={handleClick}
        disabled={disabled}
        className={` ${context?.variant === 'flyout' ? 'w-full rounded-none px-2' : ''} `}
      >
        {!command?.icon && props.img && (
          <img src={props.img} alt={props.label} className="h-5 w-5" />
        )}
        {command?.icon && <Icon icon={command.icon} className="h-5 w-5" {...iconProps} />}
      </Button>
    </Tooltip>
  );
};

export const tabButtonRenderer: ComponentRenderFunction<TabButtonProps> = (
  { commandId, onClick, active, ...props },
  children,
) => {
  const { provides: ui } = useUICapability();
  const command = commandId ? ui?.getMenuOrAction(commandId) : null;

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (onClick) {
        onClick();
        return;
      }

      if (!commandId || !ui || !command) return;

      ui.executeCommand(commandId, {
        source: 'click',
      });
    },
    [command, commandId, ui, onClick],
  );

  return (
    <Button
      key={props.id}
      className={`rounded-none px-2 py-1 text-sm hover:bg-transparent ${active ? 'border-b-2 border-b-blue-500 text-blue-500' : 'border-b-2 border-b-transparent hover:border-b-gray-500'} hover:ring-transparent`}
      onClick={handleClick}
    >
      {props.label}
    </Button>
  );
};

export const dividerRenderer: ComponentRenderFunction<DividerComponent> = (
  props,
  _: any,
  context,
) => {
  const className =
    context?.direction === 'horizontal'
      ? 'h-6 w-[1px] bg-gray-300 self-center'
      : 'h-[1px] w-6 bg-gray-300 self-center';

  return <div className={className} />;
};

export const groupedItemsRenderer: ComponentRenderFunction<GroupedItemsProps> = (
  props,
  children,
  context,
) => {
  const style: h.JSX.CSSProperties = {
    display: 'flex',
    flexDirection: context?.direction === 'horizontal' ? 'row' : 'column',
    justifyContent: props.justifyContent || 'start',
    gap: `${props.gap || 0}px`,
  };

  return <div style={style}>{children()}</div>;
};

export const headerRenderer: ComponentRenderFunction<HeaderProps> = (props, children) => {
  const style: h.JSX.CSSProperties = {
    // Get the correct border based on placement
    ...(props.placement === 'top'
      ? { borderBottom: '1px solid #cfd4da' }
      : props.placement === 'bottom'
        ? { borderTop: '1px solid #cfd4da' }
        : props.placement === 'left'
          ? { borderRight: '1px solid #cfd4da' }
          : { borderLeft: '1px solid #cfd4da' }),
    width: props.placement === 'top' || props.placement === 'bottom' ? '100%' : 'auto',
    height: props.placement === 'left' || props.placement === 'right' ? '100%' : 'auto',
    zIndex: 10,
    justifyContent: 'space-between',
    display: 'flex',
    flexDirection: props.placement === 'top' || props.placement === 'bottom' ? 'row' : 'column',
    // Conditional padding based on placement
    ...(props.placement === 'top' || props.placement === 'bottom'
      ? {
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '16px',
          paddingRight: '16px',
        }
      : {
          paddingLeft: '8px',
          paddingRight: '8px',
          paddingTop: '16px',
          paddingBottom: '16px',
        }),
    ...props.style,
  };

  if (props.visible !== undefined && !props.visible) return null;

  return (
    <div style={style} className="header">
      {children({
        ...(props.visibleChild && {
          filter: (childId) => childId === props.visibleChild,
        }),
      })}
    </div>
  );
};

export interface LeftPanelMainProps {
  visibleChild: string;
  tabsCommandId: string;
}

export const leftPanelMainRenderer: ComponentRenderFunction<LeftPanelMainProps> = (
  props,
  children,
) => {
  const { provides: ui } = useUICapability();
  const tabsCommand = props.tabsCommandId ? ui?.getMenuOrAction(props.tabsCommandId) : null;
  const tabChildren =
    tabsCommand && tabsCommand.type === 'menu' ? ui?.getItemsByIds(tabsCommand.children) : null;

  return (
    <Fragment>
      {tabsCommand && tabChildren && (
        <div role="tablist" className="mx-4 my-4 flex flex-shrink-0 overflow-hidden bg-white">
          {tabChildren
            .filter((child) => child.type === 'action')
            .map((child, idx, array) => {
              const isActive = !!child.active;
              const isFirst = idx === 0;
              const isLast = idx === array.length - 1;

              return (
                <Tooltip key={child.id} content={child.label} trigger="hover" position="bottom">
                  <button
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    onClick={(e) =>
                      ui?.executeCommand(child.id, {
                        source: 'click',
                        triggerElement: e.currentTarget as HTMLElement,
                        position: 'bottom',
                      })
                    }
                    className={`relative flex h-7 flex-1 cursor-pointer items-center justify-center border outline-none transition-colors ${isFirst ? 'rounded-l-md' : ''} ${isLast ? 'rounded-r-md' : ''} ${!isLast ? 'border-r-0' : ''} ${
                      isActive
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    } `}
                  >
                    {child.icon && (
                      <Icon icon={child.icon} className="pointer-events-none block h-5 w-5" />
                    )}
                  </button>
                </Tooltip>
              );
            })}
        </div>
      )}
      {children({
        ...(props.visibleChild && {
          filter: (childId) => childId === props.visibleChild,
        }),
      })}
    </Fragment>
  );
};

export const panelRenderer: ComponentRenderFunction<PanelProps & { tabsCommandId?: string }> = (
  props,
  children,
) => {
  const { elementRef, isFullscreen } = useSwipeGesture(props.open);
  const { provides: ui } = useUICapability();
  if (!props.open) return null;
  const borderClass = props.location === 'left' ? 'md:border-r' : 'md:border-l';

  const togglePanel = () => {
    ui?.togglePanel({
      id: props.id,
      visibleChild: props.visibleChild || 'leftPanelMain',
      open: !props.open,
    });
  };

  return (
    <div
      className={`flex w-full flex-none shrink-0 flex-col border-t bg-white md:w-[275px] md:min-w-[275px] md:border-t-0 ${borderClass} absolute bottom-0 left-0 right-0 z-10 touch-pan-y border-[#cfd4da] transition-all duration-300 ease-in-out md:static md:h-full ${isFullscreen ? 'h-full' : 'h-1/2'}`}
    >
      {/* Drag handle for mobile */}
      <div
        className="flex h-6 w-full cursor-grab items-center justify-center active:cursor-grabbing md:hidden"
        ref={elementRef}
      >
        <div className="h-1 w-12 rounded-full bg-gray-300"></div>
      </div>

      <div className="flex flex-row justify-end md:hidden">
        <button onClick={togglePanel} className="mr-5 cursor-pointer">
          <Icon icon="x" className="h-5 w-5" />
        </button>
      </div>

      {/* Panel content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {children({
          ...(props.visibleChild && {
            filter: (childId) => childId === props.visibleChild,
          }),
        })}
      </div>
    </div>
  );
};

function groupByPage(results: SearchResult[]) {
  return results.reduce<Record<number, { hit: SearchResult; index: number }[]>>((map, r, i) => {
    (map[r.pageIndex] ??= []).push({ hit: r, index: i });
    return map;
  }, {});
}

/** one hit line – click jumps to the first rect */
function HitLine({
  hit,
  onClick,
  active,
}: {
  hit: SearchResult;
  onClick: (hit: SearchResult) => void;
  active: boolean;
}) {
  const { before, match, after, truncatedLeft, truncatedRight } = hit.context;
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [active]);

  return (
    <button
      ref={ref}
      onClick={() => onClick(hit)}
      className={`shadow-xs w-full cursor-pointer overflow-hidden rounded border border-[#cfd4da] p-3 text-left text-xs leading-tight text-gray-600 ${active ? 'border-blue-500 bg-blue-50' : 'hover:border-[#1a466b] hover:bg-gray-100'}`}
    >
      {truncatedLeft && '… '}
      {before}
      <span className="font-bold text-blue-500">{match}</span>
      {after}
      {truncatedRight && ' …'}
    </button>
  );
}

interface SearchRendererProps {
  flags: MatchFlag[];
  results: SearchResult[];
  total: number;
  activeResultIndex: number;
  active: boolean;
  query: string;
  loading: boolean;
}

export const searchRenderer: ComponentRenderFunction<SearchRendererProps> = (props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(props.query || '');
  const { provides: search } = useSearchCapability();
  const { provides: scroll } = useScrollCapability();
  const debouncedValue = useDebounce(inputValue, 400);

  useEffect(() => {
    // Focus the input element when the component mounts
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [search]);

  useEffect(() => {
    if (debouncedValue === '') {
      search?.stopSearch();
    } else {
      search?.searchAllPages(debouncedValue);
    }
  }, [debouncedValue, search]);

  useEffect(() => {
    if (props.activeResultIndex !== undefined) {
      scrollToItem(props.activeResultIndex);
    }
  }, [props.activeResultIndex, props.query, props.flags]);

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setInputValue(target.value);
  };

  const handleFlagChange = (flag: MatchFlag, checked: boolean) => {
    if (checked) {
      search?.setFlags([...props.flags, flag]);
    } else {
      search?.setFlags(props.flags.filter((f) => f !== flag));
    }
  };

  const scrollToItem = (index: number) => {
    const item = props.results[index];
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

  const clearInput = () => {
    setInputValue('');
    // Focus the input after clearing
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const grouped = groupByPage(props.results);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="p-4">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
            <svg
              className="h-4 w-4 text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search"
            autoFocus
            value={inputValue}
            onInput={handleInputChange}
            className="w-full rounded-md border border-gray-300 py-1 pl-8 pr-9 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {inputValue && (
            <div
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3"
              onClick={clearInput}
            >
              <svg
                className="h-4 w-4 text-gray-500 hover:text-gray-700"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-row gap-4">
          <Checkbox
            label="Case sensitive"
            checked={props.flags.includes(MatchFlag.MatchCase)}
            onChange={(checked) => handleFlagChange(MatchFlag.MatchCase, checked)}
          />
          <Checkbox
            label="Whole word"
            checked={props.flags.includes(MatchFlag.MatchWholeWord)}
            onChange={(checked) => handleFlagChange(MatchFlag.MatchWholeWord, checked)}
          />
        </div>
        <hr className="mb-2 mt-5 border-gray-200" />
        {props.active && (
          <div className="flex h-[32px] flex-row items-center justify-between">
            <div className="text-xs text-gray-500">{props.total} results found</div>
            {props.total > 1 && (
              <div className="flex flex-row">
                <Button
                  onClick={() => {
                    search?.previousResult();
                  }}
                >
                  <Icon icon={'chevronLeft'} className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => {
                    search?.nextResult();
                  }}
                >
                  <Icon icon={'chevronRight'} className="h-4 w-4" />
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
              Page {Number(page) + 1}
            </div>

            <div className="flex flex-col gap-2">
              {hits.map(({ hit, index }) => (
                <HitLine
                  key={index}
                  hit={hit}
                  active={index === props.activeResultIndex}
                  onClick={() => {
                    search?.goToResult(index);
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
};

export interface ZoomRendererProps {
  zoomLevel: number;
  commandZoomIn: string;
  commandZoomOut: string;
  commandZoomMenu: string;
  zoomMenuActive: boolean;
}

export const zoomRenderer: ComponentRenderFunction<ZoomRendererProps> = (
  props,
  children,
  context,
) => {
  const { provides: zoom } = useZoomCapability();
  const { provides: ui } = useUICapability();

  if (!ui) return null;

  const commandZoomMenu = props.commandZoomMenu ? ui.getMenuOrAction(props.commandZoomMenu) : null;
  const commandZoomIn = props.commandZoomIn ? ui.getMenuOrAction(props.commandZoomIn) : null;
  const commandZoomOut = props.commandZoomOut ? ui.getMenuOrAction(props.commandZoomOut) : null;

  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const zoomDropdownRef = useRef<any>(null);
  // Format zoom level as percentage and round to avoid floating point issues
  const zoomPercentage = Math.round(props.zoomLevel * 100);

  const handleClick = (e: MouseEvent, command: Menu<any> | Action<any> | null | undefined) => {
    if (command) {
      ui.executeCommand(command.id, {
        source: 'click',
        triggerElement: e.currentTarget as HTMLElement,
        position: context?.direction === 'horizontal' ? 'bottom' : 'right',
        flatten: true,
      });
    }
  };

  const handleZoomChange = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const zoomStr = formData.get('zoom') as string;

    zoom?.requestZoom(parseFloat(zoomStr) / 100);
  };

  useEffect(() => {
    if (zoomDropdownRef.current) {
      console.log(zoomDropdownRef.current);
    }
  }, [zoomDropdownRef.current]);

  return (
    <div className="flex flex-row items-center rounded-md bg-[#f1f3f5]">
      <form onSubmit={handleZoomChange} className="block">
        <input
          name="zoom"
          type="text"
          inputMode="numeric"
          pattern="\d*"
          className="h-6 w-8 border-0 bg-transparent p-0 text-right text-sm"
          aria-label="Set zoom"
          autoFocus={false}
          value={zoomPercentage}
          onInput={(e) => {
            // Only allow numbers
            const target = e.target as HTMLInputElement;
            target.value = target.value.replace(/[^0-9]/g, '');
          }}
        />
        <span className="text-sm">%</span>
      </form>
      <Tooltip
        position={context?.direction === 'horizontal' ? 'bottom' : 'right'}
        content={'Zoom Options'}
        trigger={props.zoomMenuActive ? 'none' : 'hover'}
      >
        <Button
          className={`p-1`}
          onClick={(e) => handleClick(e, commandZoomMenu)}
          active={props.zoomMenuActive}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-down"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M6 9l6 6l6 -6" />
          </svg>
        </Button>
      </Tooltip>
      <Tooltip
        position={context?.direction === 'horizontal' ? 'bottom' : 'right'}
        content={'Zoom Out'}
        trigger={'hover'}
      >
        <Button className="p-1" onClick={(e) => handleClick(e, commandZoomOut)}>
          {commandZoomOut?.icon && <Icon icon={commandZoomOut.icon} className="h-5 w-5" />}
        </Button>
      </Tooltip>
      <Tooltip
        position={context?.direction === 'horizontal' ? 'bottom' : 'right'}
        content={'Zoom In'}
        trigger={'hover'}
      >
        <Button className="p-1" onClick={(e) => handleClick(e, commandZoomIn)}>
          {commandZoomIn?.icon && <Icon icon={commandZoomIn.icon} className="h-5 w-5" />}
        </Button>
      </Tooltip>
    </div>
  );
};

interface TextSelectionMenuProps extends FloatingComponentProps {
  open: boolean;
  scale?: number;
  rotation?: Rotation;
}

export const textSelectionMenuRenderer: ComponentRenderFunction<TextSelectionMenuProps> = (
  props,
  children,
) => {
  const { provides: selection } = useSelectionCapability();
  const { provides: scroll } = useScrollCapability();
  const { provides: viewport } = useViewportCapability();

  if (!props.open || !selection || !scroll || !viewport) return null;

  const bounding = selection.getBoundingRects(); // one per page
  const coords = menuPositionForSelection(bounding, scroll, viewport, 10, 42);
  if (!coords) return null; // nothing visible yet

  return (
    <div
      style={{
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        transform: 'translate(-50%, 0%)',
        zIndex: 2000,
      }}
      className="absolute rounded-md border border-[#cfd4da] bg-[#f8f9fa] p-1"
    >
      {children()}
    </div>
  );
};

export const pageControlsContainerRenderer: ComponentRenderFunction<FloatingComponentProps> = (
  props,
  children,
) => {
  const { provides: viewport } = useViewportCapability();
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout>();

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

    return viewport.onScrollChange((scrollMetrics) => {
      if (scrollMetrics.scrollTop > 0 || scrollMetrics.scrollLeft > 0) {
        setIsVisible(true);
        startHideTimer();
      }
    });
  }, [viewport, startHideTimer]);

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

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`rounded-md border border-[#cfd4da] bg-[#f8f9fa] p-1 transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {children()}
      </div>
    </div>
  );
};

export interface PageControlsProps {
  currentPage: number;
  pageCount: number;
  nextPageCommandId: string;
  previousPageCommandId: string;
}

export const pageControlsRenderer: ComponentRenderFunction<PageControlsProps> = (props) => {
  const { provides: scroll } = useScrollCapability();
  const { provides: ui } = useUICapability();
  const isFirstPage = props.currentPage === 1;
  const isLastPage = props.currentPage === props.pageCount;

  const commandNextPage = props.nextPageCommandId
    ? ui?.getMenuOrAction(props.nextPageCommandId)
    : null;
  const commandPreviousPage = props.previousPageCommandId
    ? ui?.getMenuOrAction(props.previousPageCommandId)
    : null;

  const handlePageChange = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const pageStr = formData.get('page') as string;
    const page = parseInt(pageStr);

    if (!isNaN(page) && page >= 1) {
      scroll?.scrollToPage({
        pageNumber: page,
      });
    }
  };

  const handleClick = (e: MouseEvent, command: Menu<any> | Action<any> | null | undefined) => {
    if (command && ui) {
      ui.executeCommand(command.id, {
        source: 'click',
        triggerElement: e.currentTarget as HTMLElement,
      });
    }
  };

  return (
    <div className="flex flex-row items-center justify-between gap-3 rounded-md">
      <Tooltip position={'top'} content={'Previous Page'} trigger={isFirstPage ? 'none' : 'hover'}>
        <Button
          className={`p-1 ${isFirstPage ? 'cursor-not-allowed opacity-50 hover:ring-0' : ''}`}
          onClick={(e) => handleClick(e, commandPreviousPage)}
          disabled={isFirstPage}
        >
          {commandPreviousPage?.icon && (
            <Icon icon={commandPreviousPage.icon} className="h-5 w-5" />
          )}
        </Button>
      </Tooltip>
      <form className="flex flex-row items-center gap-3" onSubmit={handlePageChange}>
        <input
          name="page"
          type="text"
          inputMode="numeric"
          pattern="\d*"
          className="border-1 h-8 w-8 rounded-md border-gray-600 bg-white p-0 text-center text-sm"
          aria-label="Set page"
          value={props.currentPage}
          onInput={(e) => {
            // Only allow numbers
            const target = e.target as HTMLInputElement;
            target.value = target.value.replace(/[^0-9]/g, '');
          }}
        />
        <span className="text-sm">{props.pageCount}</span>
      </form>
      <Tooltip position={'top'} content={'Next Page'} trigger={isLastPage ? 'none' : 'hover'}>
        <Button
          className={`p-1 ${isLastPage ? 'cursor-not-allowed opacity-50 hover:ring-0' : ''}`}
          onClick={(e) => handleClick(e, commandNextPage)}
          disabled={isLastPage}
        >
          {commandNextPage?.icon && <Icon icon={commandNextPage.icon} className="h-5 w-5" />}
        </Button>
      </Tooltip>
    </div>
  );
};

export const commandMenuRenderer: ComponentRenderFunction<CommandMenuProps> = ({
  activeCommand,
  open,
  position,
  triggerElement,
  flatten,
}) => {
  const { provides: ui } = useUICapability();
  const [history, setHistory] = useState<string[]>([]);
  const lastPushRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) setHistory([]);
  }, [open]);

  useEffect(() => {
    if (!activeCommand) return;

    if (lastPushRef.current === activeCommand) {
      lastPushRef.current = null;
      return;
    }

    setHistory([]);
  }, [activeCommand]);

  if (!ui) return null;

  const items = activeCommand ? ui?.getChildItems(activeCommand, { flatten }) : null;

  const currentMenu =
    history.length > 0 && activeCommand ? ui.getMenuOrAction(activeCommand) : undefined;

  const handleHide = () => {
    ui.hideCommandMenu();
  };

  const handleCommandClick = (command: MenuItem) => {
    if (command.type === 'action') {
      ui.hideCommandMenu();
      ui.executeCommand(command.id);
    } else if (command.type === 'menu') {
      pushMenu(command.id);
    }
  };

  const pushMenu = (menuId: string) => {
    if (activeCommand) setHistory((prev) => [...prev, activeCommand]);
    lastPushRef.current = menuId;

    ui.executeCommand(menuId, {
      triggerElement: triggerElement,
      position: position,
    });
  };

  const goBack = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    lastPushRef.current = previous;
    ui.executeCommand(previous, {
      triggerElement: triggerElement,
      position: position,
    });
  };

  const renderCommandItem = (command: ResolvedMenuItem, index: number) => {
    if (command.type === 'group') {
      const group = command as Group;
      const groupChildren = ui.getItemsByIds(group.children);

      return (
        <Fragment key={command.id}>
          <div className="px-4 py-3 text-xs font-medium uppercase text-gray-600">{group.label}</div>
          {groupChildren.map((child, childIndex) => (
            <Fragment key={child.id}>{renderCommandItem(child, childIndex)}</Fragment>
          ))}
          <hr className="my-2 border-gray-200" />
        </Fragment>
      );
    }

    const divider =
      command.dividerBefore && index !== 0 ? <hr className="my-2 border-gray-200" /> : null;

    return (
      <Fragment key={command.id}>
        {divider}
        <button
          disabled={command.disabled ? true : false}
          onClick={() => handleCommandClick(command)}
          className={`flex cursor-pointer flex-row items-center justify-between gap-2 px-4 py-1 ${command.type === 'menu' ? 'menu-item' : ''} ${command.active && !command.disabled ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-blue-900 hover:text-white'} ${command.disabled ? 'pointer-events-none cursor-not-allowed opacity-50' : ''} `}
        >
          <div className="flex flex-row items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center">
              {command.icon && (
                <Icon icon={command.icon} className="h-6 w-6" {...command.iconProps} />
              )}
            </div>
            <div className="text-sm">{command.label}</div>
          </div>
          <div className="flex items-center">
            {command.shortcutLabel && <div className="mr-2 text-sm">({command.shortcutLabel})</div>}
            {command.type === 'menu' && <Icon icon="chevronRight" className="h-6 w-6" />}
          </div>
        </button>
      </Fragment>
    );
  };

  const menuContent = (
    <Fragment>
      {history.length > 0 && (
        <div
          onClick={goBack}
          className="flex cursor-pointer flex-row items-center gap-2 px-4 py-1 pb-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
        >
          <Icon icon="chevronLeft" className="h-6 w-6 text-gray-500" /> {currentMenu?.label}
        </div>
      )}
      {items?.map((item, index) => renderCommandItem(item, index))}
    </Fragment>
  );

  if (!open) return null;

  // Render as Dropdown if there's a triggerElement, otherwise as SwipeableDrawer
  return (
    <Dropdown
      trigger={triggerElement}
      open={open}
      placement={position || 'bottom'}
      className="@max-[600px]:!bottom-0 @max-[600px]:!top-auto @max-[600px]:!left-0 @max-[600px]:!right-0"
      onShow={() => {}}
      onHide={handleHide}
    >
      {menuContent}
    </Dropdown>
  );
};

export interface ThumbnailsRenderProps {
  currentPage: number;
}

export const thumbnailsRender: ComponentRenderFunction<ThumbnailsRenderProps> = (
  props,
  children,
) => {
  const { provides: scroll } = useScrollCapability();

  return (
    <ThumbnailsPane className="flex-1" selectedPage={props.currentPage}>
      {(m) => (
        <div
          key={m.pageIndex}
          className="absolute flex w-full cursor-pointer flex-col items-center"
          style={{ height: m.wrapperHeight, top: m.top }}
          onClick={() => {
            scroll?.scrollToPage({
              pageNumber: m.pageIndex + 1,
            });
          }}
        >
          {/* thumbnail box */}
          <div
            style={{ width: m.width, height: m.height }}
            className={`outline outline-2 -outline-offset-2 ${props.currentPage === m.pageIndex + 1 ? 'outline-blue-500' : 'outline-gray-300'}`}
          >
            <ThumbImg meta={m} className="h-full w-full object-contain" />
          </div>

          {/* label box with fixed height = labelHeight */}
          <div
            className="flex items-center justify-center text-xs text-gray-500"
            style={{ height: m.labelHeight }}
          >
            {m.pageIndex + 1}
          </div>
        </div>
      )}
    </ThumbnailsPane>
  );
};

interface OutlineRenderProps {
  document: PdfDocumentObject;
}

export const outlineRenderer: ComponentRenderFunction<OutlineRenderProps> = (props, children) => {
  const { provides: bookmark } = useBookmarkCapability();
  const { provides: scroll } = useScrollCapability();
  const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!bookmark) return;
    const task = bookmark.getBookmarks();
    task.wait(({ bookmarks }) => {
      setBookmarks(bookmarks);
      // Auto-expand first level items
      const firstLevelIds = bookmarks.map((_, index) => `bookmark-${index}`);
      setExpandedItems(new Set(firstLevelIds));
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'Bookmark task cancelled',
      });
    };
  }, [bookmark, props.document]);

  const handleBookmarkClick = (bookmark: PdfBookmarkObject) => {
    if (!scroll || !bookmark.target || bookmark.target.type !== 'action') return;

    const action = bookmark.target.action;
    if (action.type === 1 && action.destination) {
      // Type 1 is "Go to destination"

      const destination = action.destination;

      if (destination.zoom.mode === PdfZoomMode.XYZ) {
        const page = props.document?.pages.find((p) => p.index === destination.pageIndex);
        if (!page) return;

        scroll.scrollToPage({
          pageNumber: destination.pageIndex + 1, // Convert from 0-based to 1-based
          pageCoordinates: destination.zoom.params
            ? {
                x: destination.zoom.params.x,
                y: page.size.height - destination.zoom.params.y,
              }
            : undefined,
          behavior: 'smooth',
        });
      } else if (destination.zoom.mode === PdfZoomMode.FitPage) {
        scroll.scrollToPage({
          pageNumber: destination.pageIndex + 1, // Convert from 0-based to 1-based
          behavior: 'smooth',
        });
      }
    }
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const renderBookmarkItem = (bookmark: PdfBookmarkObject, index: number, level: number = 0) => {
    const itemId = `bookmark-${index}`;
    const hasChildren = bookmark.children && bookmark.children.length > 0;
    const isExpanded = expandedItems.has(itemId);
    const paddingLeft = level * 16 + 8; // 16px per level + 8px base padding

    return (
      <div key={itemId} className="outline-item">
        <div
          className="flex cursor-pointer items-center py-1 pr-4 text-sm text-gray-700 hover:bg-gray-100"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => handleBookmarkClick(bookmark)}
        >
          {hasChildren && (
            <button
              className="mr-1 flex h-4 w-4 items-center justify-center rounded hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(itemId);
              }}
            >
              <Icon
                icon={isExpanded ? 'chevronDown' : 'chevronRight'}
                className="h-3 w-3 text-gray-500"
              />
            </button>
          )}
          {!hasChildren && <div className="mr-1 w-4" />}
          <span className="flex-1 truncate" title={bookmark.title}>
            {bookmark.title}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="outline-children">
            {bookmark.children?.map((child, childIndex) =>
              renderBookmarkItem(child, `${index}-${childIndex}` as any, level + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center text-gray-500">
          <div className="text-sm">No outline available</div>
          <div className="mt-1 text-xs">This document doesn't contain bookmarks</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        <div className="outline-tree">
          {bookmarks.map((bookmark, index) => renderBookmarkItem(bookmark, index))}
        </div>
      </div>
    </div>
  );
};

interface AttachmentsRenderProps {
  document: PdfDocumentObject;
}

export const attachmentsRenderer: ComponentRenderFunction<AttachmentsRenderProps> = (
  props,
  children,
) => {
  const { provides: attachment } = useAttachmentCapability();
  const [attachments, setAttachments] = useState<PdfAttachmentObject[]>([]);

  useEffect(() => {
    if (!attachment) return;
    const task = attachment.getAttachments();
    task.wait((attachments) => {
      setAttachments(attachments);
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'Bookmark task cancelled',
      });
    };
  }, [attachment, props.document]);

  const handleAttachmentClick = (attachmentObject: PdfAttachmentObject) => {
    if (!attachment) return;
    const task = attachment.downloadAttachment(attachmentObject);
    task.wait((buffer) => {
      console.log(buffer);
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'Attachment task cancelled',
      });
    };
  };

  return (
    <div>
      {attachments.map((attachment) => (
        <div key={attachment.name} onClick={() => handleAttachmentClick(attachment)}>
          {attachment.name}
        </div>
      ))}
    </div>
  );
};

export const selectButtonRenderer: ComponentRenderFunction<SelectButtonProps> = (
  { activeCommandId, menuCommandId, active },
  children,
) => {
  const { provides: ui } = useUICapability();
  if (!ui) return null;

  const activeCommand = ui.getMenuOrAction(activeCommandId);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!ui || !menuCommandId) return;

      const triggerElement = e.currentTarget as HTMLElement;

      ui.executeCommand(menuCommandId, {
        source: 'click',
        triggerElement: triggerElement,
      });
    },
    [menuCommandId, ui],
  );

  return (
    <div style={{ maxWidth: '100px', width: '100px' }}>
      <Button
        className={`col-start-1 row-start-1 !w-full appearance-none rounded-md bg-white py-1.5 pl-3 pr-2 text-[13px] text-gray-900 ${active ? 'text-blue-500 outline outline-2 -outline-offset-2 outline-blue-500' : 'outline outline-1 -outline-offset-1 outline-gray-300'} flex flex-row items-center justify-between gap-2 hover:ring-transparent`}
        onClick={handleClick}
      >
        <span className="min-w-0 flex-1 truncate text-left">{activeCommand?.label}</span>
        <Icon icon="chevronDown" className="h-4 w-4 text-gray-500" />
      </Button>
    </div>
  );
};

export interface PrintModalProps {
  open: boolean;
}

type PageSelection = 'all' | 'current' | 'custom';

export const printModalRenderer: ComponentRenderFunction<PrintModalProps> = (props) => {
  const { provides: ui } = useUICapability();
  const { provides: scroll } = useScrollCapability();
  const { provides: printCapability } = usePrintCapability();

  const [selection, setSelection] = useState<PageSelection>('all');
  const [customPages, setCustomPages] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);

  if (!ui) return null;
  if (!props.open) return null;

  const scrollMetrics = scroll?.getMetrics();
  const currentPage = scrollMetrics?.currentPage || 1;
  const totalPages = scroll?.getTotalPages() || 0;

  console.log(scrollMetrics);

  const handleClose = () => {
    ui.updateComponentState({
      componentType: 'floating',
      componentId: 'printModal',
      patch: { open: false },
    });
  };

  const handlePrint = () => {
    let pageRange: string | undefined;

    if (selection === 'current') {
      pageRange = String(currentPage);
    } else if (selection === 'custom') {
      pageRange = customPages.trim() || undefined;
    }

    const options: PdfPrintOptions = {
      includeAnnotations,
      pageRange,
    };

    try {
      const task = printCapability?.print(options);

      if (task) {
        task.wait(() => {
          handleClose();
        }, ignore);
      }
    } catch (err) {
      console.error('Print failed:', err);
    }
  };

  const canSubmit = selection !== 'custom' || customPages.trim().length > 0;

  return (
    <Dialog open={props.open} title="Print Settings" onClose={handleClose} maxWidth="28rem">
      <div className="space-y-6">
        {/* Pages to print */}
        <div>
          <label className="mb-3 block text-sm font-medium text-gray-700">Pages to print</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="pageRange"
                value="all"
                checked={selection === 'all'}
                onChange={() => setSelection('all')}
                className="mr-2"
              />
              <span className="text-sm">All pages</span>
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="pageRange"
                value="current"
                checked={selection === 'current'}
                onChange={() => setSelection('current')}
                className="mr-2"
              />
              <span className="text-sm">Current page ({currentPage})</span>
            </label>

            <label className="flex items-start">
              <input
                type="radio"
                name="pageRange"
                value="custom"
                checked={selection === 'custom'}
                onChange={() => setSelection('custom')}
                className="mr-2 mt-0.5"
              />
              <div className="flex-1">
                <span className="mb-1 block text-sm">Specify pages</span>
                <input
                  type="text"
                  placeholder="e.g., 1-3, 5, 8-10"
                  value={customPages}
                  onInput={(e) => setCustomPages((e.target as HTMLInputElement).value)}
                  disabled={selection !== 'custom'}
                  className={`w-full rounded-md border px-3 py-1 text-sm ${
                    selection !== 'custom'
                      ? 'bg-gray-100 text-gray-500'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  } focus:outline-none focus:ring-1`}
                />
                {selection === 'custom' && customPages.trim() && totalPages > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Total pages in document: {totalPages}
                  </p>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Include annotations */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeAnnotations}
              onChange={(e) => setIncludeAnnotations((e.target as HTMLInputElement).checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">Include annotations</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4">
          <Button
            onClick={handleClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!canSubmit}
            className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm text-white hover:!bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
