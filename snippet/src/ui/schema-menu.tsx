import { h, Fragment } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
  MenuRendererProps,
  MenuItem,
  useUISchema,
  MenuSchema,
  getUIItemProps,
  useUIContainer,
} from '@embedpdf/plugin-ui/preact';
import { useCommand } from '@embedpdf/plugin-commands/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { ChevronLeftIcon } from '@/components/icons/chevron-left';
import { icons } from '@/components/icons';
import { ChevronRightIcon } from '@/components/icons/chevron-right';
import { useContainerBreakpoint } from './hooks/use-container-breakpoint';

// Breakpoint for mobile behavior
const MOBILE_BREAKPOINT = 768;

// Animation duration in ms
const ANIMATION_DURATION = 300;

// Drag thresholds
const VELOCITY_THRESHOLD = 0.5;
const MIN_DRAG_DISTANCE = 5;
const CLOSE_THRESHOLD = 30; // percentage

interface MenuStackItem {
  menuId: string;
  schema: MenuSchema;
  title?: string;
}

/**
 * Schema-driven Menu Renderer for Preact
 *
 * Desktop: Positioned dropdown menu
 * Mobile: Bottom sheet with drag-to-dismiss
 */
export function SchemaMenu({ schema, documentId, anchorEl, onClose }: MenuRendererProps) {
  const { getContainer } = useUIContainer();
  const isMobile = useContainerBreakpoint(getContainer, MOBILE_BREAKPOINT);
  const container = getContainer();
  const uiSchema = useUISchema();

  // Navigation stack for submenus
  const [menuStack, setMenuStack] = useState<MenuStackItem[]>([
    { menuId: schema.id, schema, title: undefined },
  ]);

  // Reset stack when schema changes
  useEffect(() => {
    setMenuStack([{ menuId: schema.id, schema, title: undefined }]);
  }, [schema]);

  const currentMenu = menuStack[menuStack.length - 1];

  const navigateToSubmenu = useCallback(
    (submenuId: string, title: string) => {
      if (!uiSchema) return;
      const submenuSchema = uiSchema.menus[submenuId];
      if (!submenuSchema) {
        console.warn(`Submenu schema not found: ${submenuId}`);
        return;
      }
      setMenuStack((prev) => [...prev, { menuId: submenuId, schema: submenuSchema, title }]);
    },
    [uiSchema],
  );

  const navigateBack = useCallback(() => {
    if (menuStack.length > 1) {
      setMenuStack((prev) => prev.slice(0, -1));
    }
  }, [menuStack.length]);

  if (!currentMenu) return null;

  // Mobile: render as bottom sheet
  if (isMobile && container) {
    return createPortal(
      <MobileMenu
        currentMenu={currentMenu}
        menuStack={menuStack}
        documentId={documentId}
        onClose={onClose}
        onNavigateBack={navigateBack}
        onNavigateToSubmenu={navigateToSubmenu}
        container={container}
      />,
      container,
    );
  }

  // Desktop: render as positioned dropdown
  return (
    <DesktopMenu
      currentMenu={currentMenu}
      documentId={documentId}
      anchorEl={anchorEl}
      onClose={onClose}
      onNavigateToSubmenu={navigateToSubmenu}
    />
  );
}

/**
 * Mobile Menu - Bottom sheet with drag-to-dismiss
 */
function MobileMenu({
  currentMenu,
  menuStack,
  documentId,
  onClose,
  onNavigateBack,
  onNavigateToSubmenu,
  container,
}: {
  currentMenu: MenuStackItem;
  menuStack: MenuStackItem[];
  documentId: string;
  onClose: () => void;
  onNavigateBack: () => void;
  onNavigateToSubmenu: (submenuId: string, title: string) => void;
  container: HTMLElement;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    isDragging: false,
    startY: 0,
    currentY: 0,
    startTime: 0,
    sheetHeight: 0,
  });

  // Enter animation
  useEffect(() => {
    setIsVisible(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
    });
  }, []);

  // Calculate natural content height
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      // Measure content height (with header if present)
      const headerHeight = menuStack.length > 1 ? 60 : 0;
      const itemsHeight = contentRef.current.scrollHeight;
      const totalHeight = headerHeight + itemsHeight + 24; // padding
      const maxHeight = container.clientHeight * 0.8; // max 80%
      setContentHeight(Math.min(totalHeight, maxHeight));
    }
  }, [currentMenu, menuStack.length, container]);

  // Close with animation
  const closeWithAnimation = useCallback(() => {
    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, ANIMATION_DURATION);
  }, [onClose]);

  // Drag handlers
  const handleDragStart = useCallback((clientY: number) => {
    if (!sheetRef.current) return;
    dragState.current = {
      isDragging: true,
      startY: clientY,
      currentY: clientY,
      startTime: Date.now(),
      sheetHeight: sheetRef.current.offsetHeight,
    };
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!dragState.current.isDragging) return;

    const deltaY = clientY - dragState.current.startY;
    // Only allow dragging down
    const offset = Math.max(0, deltaY);
    dragState.current.currentY = clientY;
    setDragOffset(offset);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragState.current.isDragging) return;

    const { startY, currentY, startTime, sheetHeight } = dragState.current;
    const totalMovement = Math.abs(startY - currentY);

    dragState.current.isDragging = false;

    // Ignore clicks
    if (totalMovement < MIN_DRAG_DISTANCE) {
      setDragOffset(0);
      return;
    }

    const deltaY = currentY - startY;
    const percentDragged = (deltaY / sheetHeight) * 100;

    // Calculate velocity
    const timeDelta = Date.now() - startTime;
    const velocity = timeDelta > 0 ? deltaY / timeDelta : 0;

    // Close if dragged down enough or fast swipe down
    if (percentDragged > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      closeWithAnimation();
    } else {
      setDragOffset(0);
    }
  }, [closeWithAnimation]);

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      handleDragStart(e.touches[0].clientY);
    },
    [handleDragStart],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (dragState.current.isDragging && e.cancelable) {
        e.preventDefault();
      }
      handleDragMove(e.touches[0].clientY);
    },
    [handleDragMove],
  );

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientY);
    },
    [handleDragStart],
  );

  // Global mouse handlers
  useEffect(() => {
    if (!dragState.current.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const handleMouseUp = () => handleDragEnd();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleDragMove, handleDragEnd]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWithAnimation();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeWithAnimation]);

  if (!isVisible) return null;

  const translateY = isAnimatingIn ? dragOffset : contentHeight || 400;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-40 bg-black transition-opacity duration-300 ${
          isAnimatingIn ? 'opacity-30' : 'opacity-0'
        }`}
        onClick={closeWithAnimation}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white shadow-2xl ${
          !dragState.current.isDragging ? 'transition-transform duration-300 ease-out' : ''
        }`}
        style={{
          maxHeight: '80%',
          transform: `translateY(${translateY}px)`,
        }}
        {...getUIItemProps(currentMenu.schema)}
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

        {/* Header with back button (for submenus) */}
        {menuStack.length > 1 && (
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 pb-3">
            <button onClick={onNavigateBack} className="rounded-full p-1 hover:bg-gray-100">
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h3 className="font-semibold text-gray-900">{currentMenu.title || 'Menu'}</h3>
          </div>
        )}

        {/* Menu Items */}
        <div ref={contentRef} className="flex-1 overflow-y-auto py-2">
          {currentMenu.schema.items.map((item) => (
            <MenuItemRenderer
              key={item.id}
              item={item}
              documentId={documentId}
              onClose={closeWithAnimation}
              isMobile={true}
              onNavigateToSubmenu={onNavigateToSubmenu}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Desktop Menu - Positioned dropdown
 */
function DesktopMenu({
  currentMenu,
  documentId,
  anchorEl,
  onClose,
  onNavigateToSubmenu,
}: {
  currentMenu: MenuStackItem;
  documentId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onNavigateToSubmenu: (submenuId: string, title: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate position
  useEffect(() => {
    if (!anchorEl) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth || 200;

      let top = rect.bottom + 4;
      let left = rect.left;

      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorEl]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;

      const path = event.composedPath();
      const clickedInMenu = path.includes(menuRef.current);
      const clickedInAnchor = anchorEl && path.includes(anchorEl);

      if (!clickedInMenu && !clickedInAnchor) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, anchorEl]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const menuStyle = position
    ? {
        position: 'fixed' as const,
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
      }
    : { display: 'none' };

  return (
    <div
      ref={menuRef}
      {...getUIItemProps(currentMenu.schema)}
      className="min-w-[200px] rounded-lg border border-gray-300 bg-white py-2 shadow-lg"
      style={menuStyle}
    >
      {currentMenu.schema.items.map((item) => (
        <MenuItemRenderer
          key={item.id}
          item={item}
          documentId={documentId}
          onClose={onClose}
          isMobile={false}
          onNavigateToSubmenu={onNavigateToSubmenu}
        />
      ))}
    </div>
  );
}

/**
 * Renders a single menu item
 */
function MenuItemRenderer({
  item,
  documentId,
  onClose,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: MenuItem;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu: (submenuId: string, title: string) => void;
}) {
  switch (item.type) {
    case 'command':
      return (
        <CommandMenuItem
          item={item}
          documentId={documentId}
          onClose={onClose}
          isMobile={isMobile}
        />
      );
    case 'submenu':
      return (
        <SubmenuItem
          item={item}
          documentId={documentId}
          isMobile={isMobile}
          onNavigateToSubmenu={onNavigateToSubmenu}
        />
      );
    case 'divider':
      return (
        <div {...getUIItemProps(item)}>
          <hr className="my-2 border-gray-200" />
        </div>
      );
    case 'section':
      return (
        <SectionItem
          item={item}
          documentId={documentId}
          onClose={onClose}
          isMobile={isMobile}
          onNavigateToSubmenu={onNavigateToSubmenu}
        />
      );
    default:
      return null;
  }
}

/**
 * Command Menu Item
 */
function CommandMenuItem({
  item,
  documentId,
  onClose,
  isMobile,
}: {
  item: Extract<MenuItem, { type: 'command' }>;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  const command = useCommand(item.commandId, documentId);

  if (!command || !command.visible) return null;

  const IconComponent = command.icon ? icons[command.icon] : null;

  const handleClick = () => {
    if (!command.disabled) {
      command.execute();
      onClose();
    }
  };

  if (isMobile) {
    return (
      <button
        {...getUIItemProps(item)}
        onClick={handleClick}
        disabled={command.disabled}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left text-base transition-colors active:bg-gray-100 ${
          command.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${command.active ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}
        role="menuitem"
      >
        {IconComponent && (
          <IconComponent
            className="h-5 w-5"
            primaryColor={command.iconProps?.primaryColor}
            secondaryColor={command.iconProps?.secondaryColor}
          />
        )}
        <span className="flex-1">{command.label}</span>
      </button>
    );
  }

  return (
    <button
      {...getUIItemProps(item)}
      onClick={handleClick}
      disabled={command.disabled}
      className={`flex w-full items-center justify-between gap-2 px-4 py-1 text-left ${
        command.disabled ? 'pointer-events-none cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        command.active && !command.disabled
          ? 'bg-blue-500 text-white'
          : 'text-gray-500 hover:bg-blue-900 hover:text-white'
      }`}
      role="menuitem"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center">
          {IconComponent && (
            <IconComponent
              className="h-6 w-6"
              primaryColor={command.iconProps?.primaryColor}
              secondaryColor={command.iconProps?.secondaryColor}
            />
          )}
        </div>
        <span className="text-sm">{command.label}</span>
      </div>
    </button>
  );
}

/**
 * Submenu Item
 */
function SubmenuItem({
  item,
  documentId,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: Extract<MenuItem, { type: 'submenu' }>;
  documentId: string;
  isMobile: boolean;
  onNavigateToSubmenu: (submenuId: string, title: string) => void;
}) {
  const { translate } = useTranslations(documentId);
  const label = item.labelKey ? translate(item.labelKey) : item.label || '';

  const handleClick = () => onNavigateToSubmenu(item.menuId, label);

  if (isMobile) {
    return (
      <button
        {...getUIItemProps(item)}
        onClick={handleClick}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-base text-gray-700 transition-colors active:bg-gray-100"
        role="menuitem"
      >
        <span className="flex-1">{label}</span>
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      {...getUIItemProps(item)}
      onClick={handleClick}
      className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-1 text-left text-gray-500 hover:bg-blue-900 hover:text-white"
      role="menuitem"
    >
      <span className="text-sm">{label}</span>
      <ChevronRightIcon className="h-6 w-6" />
    </button>
  );
}

/**
 * Section Item
 */
function SectionItem({
  item,
  documentId,
  onClose,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: Extract<MenuItem, { type: 'section' }>;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu: (submenuId: string, title: string) => void;
}) {
  const { translate } = useTranslations(documentId);
  const label = item.labelKey ? translate(item.labelKey) : item.label || '';

  return (
    <div {...getUIItemProps(item)}>
      <div className="px-4 py-3 text-xs font-medium uppercase text-gray-600">{label}</div>
      {item.items.map((childItem) => (
        <MenuItemRenderer
          key={childItem.id}
          item={childItem}
          documentId={documentId}
          onClose={onClose}
          isMobile={isMobile}
          onNavigateToSubmenu={onNavigateToSubmenu}
        />
      ))}
    </div>
  );
}
