import {
  PanelRendererProps,
  useUICapability,
  useUIState,
  useItemRenderer,
} from '@embedpdf/plugin-ui/react';
import { useEffect, useMemo, useState, useRef } from 'react';
import * as Icons from '../components/icons';

/**
 * Schema-driven Panel Renderer
 *
 * Renders panels (sidebars) defined in the UI schema.
 * - Desktop: Side panel (left/right)
 * - Mobile: Bottom sheet with swipe gestures
 *
 * This is the app's custom panel renderer, passed to UIProvider.
 */

type BottomSheetHeight = 'half' | 'full';

export function SchemaPanel({ schema, documentId, isOpen, onClose }: PanelRendererProps) {
  // Only render if open (allows for animation in the future)
  if (!isOpen) return null;
  const { position, content, width, type } = schema;
  const { provides } = useUICapability();
  const uiState = useUIState(documentId);
  const { renderCustomComponent } = useItemRenderer();

  // Mobile detection - initialize immediately to prevent flash
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Bottom sheet state for mobile
  const [sheetHeight, setSheetHeight] = useState<BottomSheetHeight>('half');
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);

  if (type !== 'sidebar') {
    console.warn(`Unsupported panel type: ${type}`);
    return null;
  }

  const positionClasses = getPositionClasses(position?.placement ?? 'left');
  const widthStyle = width ? { width } : undefined;

  const scope = useMemo(
    () => (provides ? provides.forDocument(documentId) : null),
    [provides, documentId],
  );

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setCurrentY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !e.touches[0]) return;
    setCurrentY(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaY = currentY - startY;
    const threshold = 100; // pixels to trigger state change

    if (deltaY > threshold) {
      // Swiped down
      if (sheetHeight === 'full') {
        setSheetHeight('half');
      } else {
        onClose?.();
      }
    } else if (deltaY < -threshold) {
      // Swiped up
      if (sheetHeight === 'half') {
        setSheetHeight('full');
      }
    }

    setStartY(0);
    setCurrentY(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setCurrentY(e.clientY);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setCurrentY(e.clientY);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaY = currentY - startY;
    const threshold = 100;

    if (deltaY > threshold) {
      if (sheetHeight === 'full') {
        setSheetHeight('half');
      } else {
        onClose?.();
      }
    } else if (deltaY < -threshold) {
      if (sheetHeight === 'half') {
        setSheetHeight('full');
      }
    }

    setStartY(0);
    setCurrentY(0);
  };

  // Mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, currentY, startY, sheetHeight]);

  // Render mobile bottom sheet
  if (isMobile) {
    const heightClass = sheetHeight === 'full' ? 'h-[100vh]' : 'h-[50vh]';
    const dragOffset = isDragging ? Math.max(0, currentY - startY) : 0;

    if (content.type === 'tabs') {
      const availableTabs = content.tabs ?? [];

      const resolvedActiveTabId = useMemo(() => {
        const stateActive = uiState?.panelTabs?.[schema.id];
        if (stateActive) return stateActive;
        const scopeActive = scope?.getPanelTab?.(schema.id);
        if (scopeActive) return scopeActive;
        return stateActive ?? content.defaultTab ?? availableTabs[0]?.id ?? null;
      }, [uiState?.panelTabs, scope, schema.id, content.defaultTab, availableTabs]);

      const [localActiveTabId, setLocalActiveTabId] = useState<string | null>(null);

      useEffect(() => {
        if (localActiveTabId !== null && resolvedActiveTabId === localActiveTabId) {
          setLocalActiveTabId(null);
        }
      }, [resolvedActiveTabId, localActiveTabId]);

      const activeTabId = localActiveTabId ?? resolvedActiveTabId;

      const handleTabSelect = (tabId: string) => {
        if (tabId === activeTabId) return;
        setLocalActiveTabId(tabId);

        if (scope) {
          scope.setPanelTab(schema.id, tabId);
        }
      };

      const activeTab =
        availableTabs.find((tab) => tab.id === activeTabId) ??
        availableTabs.find((tab) => tab.id === resolvedActiveTabId) ??
        availableTabs[0];

      if (!activeTab) {
        console.warn(`No tabs defined for panel ${schema.id}`);
        return null;
      }

      return (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <div
            ref={panelRef}
            className={`fixed bottom-0 left-0 right-0 z-50 ${heightClass} flex flex-col rounded-t-2xl bg-white shadow-2xl transition-all duration-300`}
            style={{
              transform: `translateY(${dragOffset}px)`,
            }}
            data-panel-id={schema.id}
          >
            {/* Drag Handle & Header */}
            <div
              className="flex cursor-grab items-center justify-between border-b border-gray-200 px-4 py-3 active:cursor-grabbing"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
            >
              <div className="flex flex-1 justify-center">
                <div className="h-1.5 w-12 rounded-full bg-gray-300" />
              </div>
              <button
                onClick={onClose}
                className="ml-2 rounded-full p-1 transition-colors hover:bg-gray-100"
                aria-label="Close panel"
              >
                <Icons.CloseIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              {availableTabs.map((tab) => {
                const isActive = tab.id === (activeTab?.id ?? activeTabId);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-b-2 border-blue-500 bg-white text-blue-600'
                        : 'text-gray-600 hover:bg-white hover:text-gray-800'
                    }`}
                    onClick={() => handleTabSelect(tab.id)}
                  >
                    {tab.label ?? tab.id}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {renderCustomComponent(activeTab.componentId, documentId, {
                tabId: activeTab.id,
                onClose,
              })}
            </div>
          </div>
        </>
      );
    }

    // Mobile: component-only panel
    if (content.type === 'component') {
      return (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <div
            ref={panelRef}
            className={`fixed bottom-0 left-0 right-0 z-50 ${heightClass} flex flex-col rounded-t-2xl bg-white shadow-2xl transition-all duration-300`}
            style={{
              transform: `translateY(${dragOffset}px)`,
            }}
            data-panel-id={schema.id}
          >
            {/* Drag Handle & Header */}
            <div
              className="flex cursor-grab items-center justify-between border-b border-gray-200 px-4 py-3 active:cursor-grabbing"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
            >
              <div className="flex flex-1 justify-center">
                <div className="h-1.5 w-12 rounded-full bg-gray-300" />
              </div>
              <button
                onClick={onClose}
                className="ml-2 rounded-full p-1 transition-colors hover:bg-gray-100"
                aria-label="Close panel"
              >
                <Icons.CloseIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {renderCustomComponent(content.componentId, documentId, {
                onClose,
              })}
            </div>
          </div>
        </>
      );
    }
  }

  // Desktop rendering
  if (content.type === 'tabs') {
    const availableTabs = content.tabs ?? [];

    const resolvedActiveTabId = useMemo(() => {
      const stateActive = uiState?.panelTabs?.[schema.id];
      if (stateActive) return stateActive;
      const scopeActive = scope?.getPanelTab?.(schema.id);
      if (scopeActive) return scopeActive;
      return stateActive ?? content.defaultTab ?? availableTabs[0]?.id ?? null;
    }, [uiState?.panelTabs, scope, schema.id, content.defaultTab, availableTabs]);

    const [localActiveTabId, setLocalActiveTabId] = useState<string | null>(null);

    useEffect(() => {
      if (localActiveTabId !== null && resolvedActiveTabId === localActiveTabId) {
        setLocalActiveTabId(null);
      }
    }, [resolvedActiveTabId, localActiveTabId]);

    const activeTabId = localActiveTabId ?? resolvedActiveTabId;

    const handleTabSelect = (tabId: string) => {
      if (tabId === activeTabId) return;
      setLocalActiveTabId(tabId);

      if (scope) {
        scope.setPanelTab(schema.id, tabId);
      }
    };

    const activeTab =
      availableTabs.find((tab) => tab.id === activeTabId) ??
      availableTabs.find((tab) => tab.id === resolvedActiveTabId) ??
      availableTabs[0];

    if (!activeTab) {
      console.warn(`No tabs defined for panel ${schema.id}`);
      return null;
    }

    return (
      <div
        className={`${positionClasses} flex h-full flex-col`}
        style={widthStyle}
        data-panel-id={schema.id}
      >
        <div className="flex border-b border-gray-200 bg-gray-50">
          {availableTabs.map((tab) => {
            const isActive = tab.id === (activeTab?.id ?? activeTabId);
            return (
              <button
                key={tab.id}
                type="button"
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-blue-500 bg-white text-blue-600'
                    : 'text-gray-600 hover:bg-white hover:text-gray-800'
                }`}
                onClick={() => handleTabSelect(tab.id)}
              >
                {tab.label ?? tab.id}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto">
          {renderCustomComponent(activeTab.componentId, documentId, {
            tabId: activeTab.id,
            onClose,
          })}
        </div>
      </div>
    );
  }

  if (content.type === 'component') {
    return (
      <div className={`${positionClasses} h-full`} style={widthStyle} data-panel-id={schema.id}>
        {renderCustomComponent(content.componentId, documentId, {
          onClose,
        })}
      </div>
    );
  }

  return null;
}

/**
 * Get positioning classes based on panel placement
 */
function getPositionClasses(placement: 'left' | 'right' | 'top' | 'bottom'): string {
  switch (placement) {
    case 'left':
      return 'h-full border-r border-gray-300 bg-white';
    case 'right':
      return 'h-full border-l border-gray-300 bg-white';
    case 'top':
      return 'w-full border-b border-gray-300 bg-white';
    case 'bottom':
      return 'w-full border-t border-gray-300 bg-white';
    default:
      return 'h-full bg-white';
  }
}
