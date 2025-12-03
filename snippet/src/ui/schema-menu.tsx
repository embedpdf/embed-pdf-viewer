import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  MenuRendererProps,
  MenuItem,
  useUISchema,
  MenuSchema,
  getUIItemProps,
} from '@embedpdf/plugin-ui/preact';
import { useCommand } from '@embedpdf/plugin-commands/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { ChevronLeftIcon } from '@/components/icons/chevron-left';
import { icons } from '@/components/icons';
import { ChevronRightIcon } from '@/components/icons/chevron-right';

/**
 * Schema-driven Menu Renderer for Preact
 *
 * Renders menus defined in the UI schema.
 * Visibility is controlled entirely by CSS via data attributes.
 */
interface MenuStackItem {
  menuId: string;
  schema: MenuSchema;
  title?: string;
}

export function SchemaMenu({ schema, documentId, anchorEl, onClose }: MenuRendererProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const uiSchema = useUISchema();

  // Navigation stack for mobile submenus
  const [menuStack, setMenuStack] = useState<MenuStackItem[]>([
    { menuId: schema.id, schema, title: undefined },
  ]);

  // Reset stack when schema changes
  useEffect(() => {
    setMenuStack([{ menuId: schema.id, schema, title: undefined }]);
  }, [schema]);

  const currentMenu = menuStack[menuStack.length - 1];

  const navigateToSubmenu = (submenuId: string, title: string) => {
    if (!uiSchema) return;
    const submenuSchema = uiSchema.menus[submenuId];
    if (!submenuSchema) {
      console.warn(`Submenu schema not found: ${submenuId}`);
      return;
    }
    setMenuStack([...menuStack, { menuId: submenuId, schema: submenuSchema, title }]);
  };

  const navigateBack = () => {
    if (menuStack.length > 1) {
      setMenuStack(menuStack.slice(0, -1));
    }
  };

  // Detect mobile/desktop
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate menu position relative to anchor
  useEffect(() => {
    if (!anchorEl || isMobile) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth || 200;

      let top = rect.bottom + 4;
      let left = rect.left;

      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) {
        left = 8;
      }

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorEl, isMobile]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const currentMenuEl = menuRef.current;

      if (!currentMenuEl) return;

      const path = event.composedPath();
      const clickedInMenu = path.includes(currentMenuEl);
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

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!currentMenu) return null;

  const menuStyle = isMobile
    ? {}
    : position
      ? {
          position: 'fixed' as const,
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 1000,
        }
      : { display: 'none' };

  return (
    <>
      {/* Backdrop for mobile */}
      {isMobile && (
        <div className="fixed inset-0 z-[999] bg-black bg-opacity-50" onClick={onClose} />
      )}

      {/* Menu */}
      <div
        ref={menuRef}
        {...getUIItemProps(currentMenu.schema)}
        className={`min-w-[200px] rounded-lg border border-gray-300 bg-white shadow-lg ${
          isMobile ? 'fixed bottom-0 left-0 right-0 z-[1000] max-h-[80vh] rounded-b-none' : ''
        }`}
        style={menuStyle}
      >
        {/* Mobile Header */}
        {isMobile && menuStack.length > 1 && (
          <div className="flex items-center gap-3 border-b border-gray-300 p-4">
            <button onClick={navigateBack} className="p-1">
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h3 className="font-semibold">{currentMenu.title || 'Menu'}</h3>
          </div>
        )}

        {/* Menu Items */}
        <div className={`${isMobile ? 'max-h-[calc(80vh-60px)] overflow-y-auto' : 'py-2'}`}>
          {currentMenu.schema.items.map((item) => (
            <MenuItemRenderer
              key={item.id}
              item={item}
              documentId={documentId}
              onClose={onClose}
              isMobile={isMobile}
              onNavigateToSubmenu={navigateToSubmenu}
            />
          ))}
        </div>
      </div>
    </>
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

  // Mobile styling
  if (isMobile) {
    const baseClasses =
      'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100';
    const disabledClasses = command.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    const activeClasses = command.active ? 'bg-blue-50 text-blue-600' : 'text-gray-700';

    return (
      <button
        {...getUIItemProps(item)}
        onClick={handleClick}
        disabled={command.disabled}
        className={`${baseClasses} ${disabledClasses} ${activeClasses} w-full text-left`}
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

  // Desktop styling
  const baseClasses = 'flex flex-row items-center justify-between gap-2 px-4 py-1 w-full text-left';
  const disabledClasses = command.disabled
    ? 'pointer-events-none cursor-not-allowed opacity-50'
    : 'cursor-pointer';
  const activeClasses =
    command.active && !command.disabled
      ? 'bg-blue-500 text-white'
      : 'text-gray-500 hover:bg-blue-900 hover:text-white';

  return (
    <button
      {...getUIItemProps(item)}
      onClick={handleClick}
      disabled={command.disabled}
      className={`${baseClasses} ${disabledClasses} ${activeClasses}`}
      role="menuitem"
    >
      <div className="flex flex-row items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center">
          {IconComponent && (
            <IconComponent
              className="h-6 w-6"
              primaryColor={command.iconProps?.primaryColor}
              secondaryColor={command.iconProps?.secondaryColor}
            />
          )}
        </div>
        <div className="text-sm">{command.label}</div>
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

  const handleClick = () => {
    onNavigateToSubmenu(item.menuId, label);
  };

  // Mobile styling
  if (isMobile) {
    const baseClasses =
      'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100';

    return (
      <button
        {...getUIItemProps(item)}
        onClick={handleClick}
        className={`${baseClasses} w-full cursor-pointer text-left text-gray-700`}
        role="menuitem"
      >
        <span className="flex-1">{label}</span>
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    );
  }

  // Desktop styling
  const baseClasses = 'flex flex-row items-center justify-between gap-2 px-4 py-1 w-full text-left';
  const hoverClasses = 'cursor-pointer text-gray-500 hover:bg-blue-900 hover:text-white';

  return (
    <button
      {...getUIItemProps(item)}
      onClick={handleClick}
      className={`${baseClasses} ${hoverClasses}`}
      role="menuitem"
    >
      <div className="flex flex-row items-center gap-2">
        <div className="text-sm">{label}</div>
      </div>
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
