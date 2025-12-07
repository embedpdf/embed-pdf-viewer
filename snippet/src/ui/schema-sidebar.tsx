import { h, Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { SidebarRendererProps, useItemRenderer, useUIContainer } from '@embedpdf/plugin-ui/preact';
import { Icon } from '@/components/ui/icon';

// Drawer snap points as percentages
const SNAP_CLOSED = 0;
const SNAP_HALF = 50;
const SNAP_FULL = 100;

// Animation duration in ms
const ANIMATION_DURATION = 300;

// Threshold for velocity-based snapping (pixels per ms)
const VELOCITY_THRESHOLD = 0.5;
// Threshold for position-based snapping (percentage)
const POSITION_THRESHOLD_UP = 75; // Above this, snap to full
const POSITION_THRESHOLD_DOWN = 25; // Below this, close

// Breakpoint for mobile drawer behavior
const MOBILE_BREAKPOINT = 768;

type DrawerState = 'closed' | 'half' | 'full';

/**
 * Schema-driven Sidebar Renderer for Preact
 *
 * On large containers: Traditional sidebar (left/right)
 * On small containers: Bottom drawer with drag-to-resize
 */
export function SchemaSidebar({ schema, documentId, isOpen, onClose }: SidebarRendererProps) {
  // Start with null to indicate "not yet measured" - prevents flickering
  const [isSmallContainer, setIsSmallContainer] = useState<boolean | null>(null);
  const { getContainer } = useUIContainer();

  // Watch for container size changes
  useEffect(() => {
    const container = getContainer();
    if (!container) return;

    const checkContainerSize = () => {
      const width = container.clientWidth;
      setIsSmallContainer(width < MOBILE_BREAKPOINT);
    };

    checkContainerSize();

    const observer = new ResizeObserver(checkContainerSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [getContainer]);

  // Don't render until we know the container size (prevents flickering)
  if (isSmallContainer === null) return null;

  const { position, content, width } = schema;
  const { renderCustomComponent } = useItemRenderer();
  const container = getContainer();

  // On small containers, render as bottom drawer (portaled to root)
  if (isSmallContainer && container) {
    return createPortal(
      <BottomDrawer
        schema={schema}
        documentId={documentId}
        isOpen={isOpen}
        onClose={onClose}
        renderCustomComponent={renderCustomComponent}
        content={content}
        rootElement={container}
      />,
      container,
    );
  }

  // On large containers, render as traditional sidebar (only when open)
  if (!isOpen) return null;

  const positionClasses = getPositionClasses(position.placement);
  const widthStyle = width ? { width } : undefined;

  return (
    <div
      className={`${positionClasses} flex flex-col border-gray-300 bg-white shadow-lg`}
      style={widthStyle}
      data-sidebar-id={schema.id}
    >
      {/* Sidebar Content */}
      <div className="min-h-0 flex-1">
        {content.type === 'tabs' && (
          <TabsContent
            content={content}
            documentId={documentId}
            renderCustomComponent={renderCustomComponent}
          />
        )}
        {content.type === 'component' && (
          <>{renderCustomComponent(content.componentId, documentId, {})}</>
        )}
      </div>
    </div>
  );
}

/**
 * Bottom Drawer Component with drag-to-resize functionality
 * Handles open/close animations based on isOpen prop
 */
function BottomDrawer({
  schema,
  documentId,
  isOpen,
  onClose,
  renderCustomComponent,
  content,
  rootElement,
}: {
  schema: SidebarRendererProps['schema'];
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  renderCustomComponent: (componentId: string, documentId: string, props: any) => any;
  content: SidebarRendererProps['schema']['content'];
  rootElement: HTMLElement;
}) {
  // Track the visual state separately from isOpen to allow animations
  const [drawerState, setDrawerState] = useState<DrawerState>('closed');
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ y: 0, height: 0, time: 0 });
  const lastDragRef = useRef({ y: 0, time: 0 });

  // Handle isOpen changes for enter/exit animations
  useEffect(() => {
    if (isOpen) {
      // Opening: make visible immediately, then animate to half
      setIsVisible(true);
      // Use requestAnimationFrame to ensure the closed state renders first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDrawerState('half');
        });
      });
    } else {
      // Closing: animate to closed, then hide after animation
      setDrawerState('closed');
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Get the current height percentage based on state
  const getHeightFromState = (state: DrawerState): number => {
    switch (state) {
      case 'closed':
        return SNAP_CLOSED;
      case 'half':
        return SNAP_HALF;
      case 'full':
        return SNAP_FULL;
    }
  };

  // Calculate the target snap point based on current position and velocity
  const calculateSnapPoint = (currentPercent: number, velocity: number): DrawerState => {
    // Velocity-based snapping (fast swipe)
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      if (velocity > 0) {
        // Swiping down (closing)
        return currentPercent > SNAP_HALF ? 'half' : 'closed';
      } else {
        // Swiping up (opening)
        return currentPercent < SNAP_HALF ? 'half' : 'full';
      }
    }

    // Position-based snapping (slow drag)
    if (currentPercent >= POSITION_THRESHOLD_UP) {
      return 'full';
    } else if (currentPercent <= POSITION_THRESHOLD_DOWN) {
      return 'closed';
    } else {
      return 'half';
    }
  };

  // Handle drag start
  const handleDragStart = useCallback(
    (clientY: number) => {
      if (!drawerRef.current) return;

      const containerHeight = rootElement.clientHeight;
      const currentHeight = drawerRef.current.offsetHeight;
      const currentPercent = (currentHeight / containerHeight) * 100;

      dragStartRef.current = {
        y: clientY,
        height: currentPercent,
        time: Date.now(),
      };
      lastDragRef.current = { y: clientY, time: Date.now() };
      setIsDragging(true);
    },
    [rootElement],
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (clientY: number) => {
      if (!isDragging) return;

      const containerHeight = rootElement.clientHeight;
      const deltaY = dragStartRef.current.y - clientY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPercent = Math.max(0, Math.min(100, dragStartRef.current.height + deltaPercent));

      // Store for velocity calculation
      lastDragRef.current = { y: clientY, time: Date.now() };

      // Calculate offset from current state position
      const statePercent = getHeightFromState(drawerState);
      setDragOffset(newPercent - statePercent);
    },
    [isDragging, drawerState, rootElement],
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    // Calculate final position
    const statePercent = getHeightFromState(drawerState);
    const currentPercent = statePercent + dragOffset;

    // Calculate velocity (positive = moving down/closing)
    const timeDelta = Date.now() - lastDragRef.current.time;
    const yDelta = lastDragRef.current.y - dragStartRef.current.y;
    const velocity = timeDelta > 0 ? yDelta / timeDelta : 0;

    // Determine snap point
    const newState = calculateSnapPoint(currentPercent, velocity);

    setIsDragging(false);
    setDragOffset(0);

    if (newState === 'closed') {
      // Call onClose which will set isOpen to false, triggering the close animation
      onClose();
    } else {
      setDrawerState(newState);
    }
  }, [isDragging, drawerState, dragOffset, onClose]);

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      handleDragStart(e.touches[0].clientY);
    },
    [handleDragStart],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isDragging) {
        e.preventDefault();
        handleDragMove(e.touches[0].clientY);
      }
    },
    [isDragging, handleDragMove],
  );

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientY);
    },
    [handleDragStart],
  );

  // Global mouse move/up handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Don't render anything if not visible
  if (!isVisible) return null;

  // Calculate the actual height to display
  const baseHeight = getHeightFromState(drawerState);
  const displayHeight = isDragging
    ? Math.max(0, Math.min(100, baseHeight + dragOffset))
    : baseHeight;

  // Calculate backdrop opacity (0 when closed, 1 when fully open)
  const backdropOpacity = Math.min(displayHeight / SNAP_HALF, 1) * 0.3;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`absolute inset-0 z-40 bg-black transition-opacity duration-300 ${
          displayHeight === 0 ? 'pointer-events-none' : ''
        }`}
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white shadow-2xl ${
          !isDragging ? 'transition-[height] duration-300 ease-out' : ''
        }`}
        style={{ height: `${displayHeight}%` }}
        data-sidebar-id={schema.id}
      >
        {/* Drag Handle */}
        <div
          className="flex flex-shrink-0 cursor-grab touch-none items-center justify-center py-3 active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>

        {/* Drawer Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {content.type === 'tabs' && (
            <TabsContent
              content={content}
              documentId={documentId}
              renderCustomComponent={renderCustomComponent}
            />
          )}
          {content.type === 'component' && (
            <>{renderCustomComponent(content.componentId, documentId, {})}</>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Renders tabs content
 */
function TabsContent({
  content,
  documentId,
  renderCustomComponent,
}: {
  content: Extract<SidebarRendererProps['schema']['content'], { type: 'tabs' }>;
  documentId: string;
  renderCustomComponent: (componentId: string, documentId: string, props: any) => any;
}) {
  const [activeTab, setActiveTab] = useState(content.tabs[0]?.id || '');

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Tab Buttons */}
      <div role="tablist" className="mx-4 mb-4 flex flex-shrink-0 overflow-hidden bg-white">
        {content.tabs.map((tab, idx, array) => {
          const isActive = activeTab === tab.id;
          const isFirst = idx === 0;
          const isLast = idx === array.length - 1;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex h-7 flex-1 cursor-pointer items-center justify-center border outline-none transition-colors ${
                isFirst ? 'rounded-l-md' : ''
              } ${isLast ? 'rounded-r-md' : ''} ${!isLast ? 'border-r-0' : ''} ${
                isActive
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.icon && <Icon icon={tab.icon} className="h-5 w-5" />}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {content.tabs
          .filter((tab) => tab.id === activeTab)
          .map((tab) => (
            <Fragment key={tab.id}>
              {renderCustomComponent(tab.componentId, documentId, {})}
            </Fragment>
          ))}
      </div>
    </div>
  );
}

/**
 * Get position classes for sidebar positioning
 */
function getPositionClasses(placement: 'left' | 'right' | 'top' | 'bottom'): string {
  switch (placement) {
    case 'left':
      return 'border-r';
    case 'right':
      return 'border-l';
    case 'top':
      return 'border-b';
    case 'bottom':
      return 'border-t';
  }
}
