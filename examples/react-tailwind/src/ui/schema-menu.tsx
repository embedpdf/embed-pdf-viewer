import { useEffect, useRef, useState } from 'react';
import {
  MenuRendererProps,
  MenuItem,
  useUISchema,
  MenuSchema,
  getUIItemProps,
} from '@embedpdf/plugin-ui/react';
import { useCommand } from '@embedpdf/plugin-commands/react';
import * as Icons from '../components/icons';
import { twMerge } from 'tailwind-merge';
import { useTranslations } from '@embedpdf/plugin-i18n/react';

/**
 * Schema-driven Menu Renderer
 *
 * Renders menus defined in the UI schema with responsive behavior:
 * - Desktop: Anchored dropdown menu
 * - Mobile: Bottom sheet modal with submenu navigation
 *
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
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
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

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Bottom Sheet */}
        <div
          ref={menuRef}
          className="animate-slide-up fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl"
          {...getUIItemProps(currentMenu.schema)}
          role="menu"
        >
          {/* Header */}
          {menuStack.length > 1 ? (
            <div className="flex items-center border-b border-gray-200 px-4 py-3">
              <button
                onClick={navigateBack}
                className="flex items-center gap-2 font-medium text-blue-600"
                aria-label="Go back"
              >
                <Icons.ChevronLeftIcon className="h-5 w-5" />
                <span>Back</span>
              </button>
              {currentMenu.title && (
                <span className="ml-auto text-sm font-semibold text-gray-700">
                  {currentMenu.title}
                </span>
              )}
            </div>
          ) : (
            <div className="flex justify-center py-3">
              <div className="h-1.5 w-12 rounded-full bg-gray-300" />
            </div>
          )}

          <div className="pb-safe px-2">
            {currentMenu.schema.items.map((item, index) => (
              <MenuItemRenderer
                key={`${item.type}-${index}`}
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

  // Desktop dropdown
  return (
    <div
      ref={menuRef}
      className="animate-fade-in fixed z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white shadow-lg"
      style={position ? { top: position.top, left: position.left } : undefined}
      {...getUIItemProps(currentMenu.schema)}
      role="menu"
    >
      {/* Header for submenus */}
      {menuStack.length > 1 && (
        <div className="flex items-center rounded-t-lg border-b border-gray-200 bg-gray-50 px-2 py-2">
          <button
            onClick={navigateBack}
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            aria-label="Go back"
          >
            <Icons.ChevronLeftIcon className="h-4 w-4" />
            <span>Back</span>
          </button>
          {currentMenu.title && (
            <span className="ml-auto text-xs font-semibold text-gray-600">{currentMenu.title}</span>
          )}
        </div>
      )}

      {/* Menu items */}
      <div className="py-1">
        {currentMenu.schema.items.map((item, index) => (
          <MenuItemRenderer
            key={`${item.type}-${index}`}
            item={item}
            documentId={documentId}
            onClose={onClose}
            isMobile={false}
            onNavigateToSubmenu={navigateToSubmenu}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Menu Item Renderer
// ─────────────────────────────────────────────────────────

interface MenuItemRendererProps {
  item: MenuItem;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
}

function MenuItemRenderer({
  item,
  documentId,
  onClose,
  isMobile,
  onNavigateToSubmenu,
}: MenuItemRendererProps) {
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
          <div
            className={isMobile ? 'my-2 border-t border-gray-200' : 'my-1 border-t border-gray-200'}
          />
        </div>
      );

    case 'section':
      return (
        <MenuSection
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

// ─────────────────────────────────────────────────────────
// Command Menu Item
// ─────────────────────────────────────────────────────────

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

  const iconName = command.icon ? `${command.icon}Icon` : null;
  const IconComponent = iconName ? Icons[iconName as keyof typeof Icons] : null;

  const baseClasses = isMobile
    ? 'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100'
    : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-100';

  const disabledClasses = command.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  const activeClasses = command.active ? 'bg-blue-50 text-blue-600' : 'text-gray-700';

  const handleClick = () => {
    if (!command.disabled) {
      command.execute();
      onClose();
    }
  };

  const iconProps = command.iconProps || {};

  return (
    <button
      {...getUIItemProps(item)}
      onClick={handleClick}
      disabled={command.disabled}
      className={twMerge(baseClasses, disabledClasses, activeClasses, 'w-full text-left')}
      role="menuitem"
    >
      {IconComponent && (
        <IconComponent
          className={isMobile ? 'h-5 w-5' : 'h-4 w-4'}
          title={command.label}
          style={{ color: iconProps.primaryColor, fill: iconProps.secondaryColor }}
        />
      )}
      <span className="flex-1">{command.label}</span>
      {command.active && <Icons.CheckIcon className="h-4 w-4" />}
      {command.shortcuts && command.shortcuts.length > 0 && !isMobile && (
        <span className="text-xs text-gray-400">{command.shortcuts[0]}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Submenu Item
// ─────────────────────────────────────────────────────────

function SubmenuItem({
  item,
  documentId,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: Extract<MenuItem, { type: 'submenu' }>;
  documentId: string;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
}) {
  const { translate } = useTranslations(documentId);
  const iconName = item.icon ? `${item.icon}Icon` : null;
  const IconComponent = iconName ? Icons[iconName as keyof typeof Icons] : null;

  const baseClasses = isMobile
    ? 'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100'
    : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-100';

  const handleClick = () => {
    if (onNavigateToSubmenu) {
      onNavigateToSubmenu(
        item.menuId,
        translate(item.labelKey || item.id, { fallback: item.label || item.id }),
      );
    }
  };

  return (
    <button
      {...getUIItemProps(item)}
      onClick={handleClick}
      className={twMerge(baseClasses, 'w-full cursor-pointer text-left text-gray-700')}
      role="menuitem"
    >
      {IconComponent && <IconComponent className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />}
      <span className="flex-1">
        {translate(item.labelKey || item.id, { fallback: item.label || item.id })}
      </span>
      <Icons.ChevronRightIcon className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Menu Section
// ─────────────────────────────────────────────────────────

function MenuSection({
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
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
}) {
  const { translate } = useTranslations(documentId);

  return (
    <div {...getUIItemProps(item)} className={isMobile ? 'py-2' : 'py-1'}>
      {(item.labelKey || item.label) && (
        <div
          className={
            isMobile
              ? 'px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500'
              : 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500'
          }
        >
          {translate(item.labelKey || item.id, { fallback: item.label || item.id })}
        </div>
      )}
      {item.items.map((subItem, index) => (
        <MenuItemRenderer
          key={`${subItem.type}-${index}`}
          item={subItem}
          documentId={documentId}
          onClose={onClose}
          isMobile={isMobile}
          onNavigateToSubmenu={onNavigateToSubmenu}
        />
      ))}
    </div>
  );
}
