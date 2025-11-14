import {
  resolveResponsiveMetadata,
  ResponsiveMetadata,
  ToolbarItem,
  ToolbarRendererProps,
} from '@embedpdf/plugin-ui/react';
import { CommandButton } from '../components/command-button';
import { CommandTabButton } from '../components/command-tab-button';
import { ToolbarDivider } from '../components/ui';
import { useItemRenderer } from '@embedpdf/plugin-ui/react';
import { useMemo } from 'react';
import { resolveResponsiveClasses } from './responsive-utils';
import { twMerge } from 'tailwind-merge';
import { useLocale } from '@embedpdf/plugin-i18n/react';

/**
 * Schema-driven Toolbar Renderer
 *
 * Renders a toolbar based on a ToolbarSchema definition from the UI plugin.
 * This component interprets the schema and renders the appropriate UI elements.
 *
 * This is the app's custom toolbar renderer, passed to UIProvider.
 */

/**
 * Main toolbar renderer
 */
export function SchemaToolbar({
  schema,
  documentId,
  isOpen,
  className = '',
}: ToolbarRendererProps) {
  // Only render if open (for animation support in the future)
  if (!isOpen) {
    return null;
  }

  const locale = useLocale();

  const responsiveMetadata = useMemo(
    () => resolveResponsiveMetadata(schema, locale),
    [schema, locale],
  );

  const isSecondarySlot = schema.position.slot === 'secondary';
  const placementClasses = getPlacementClasses(schema.position.placement);
  const slotClasses = isSecondarySlot ? 'bg-[#f1f3f5]' : '';

  return (
    <div
      className={twMerge('flex items-center gap-2', placementClasses, slotClasses, className)}
      data-toolbar-id={schema.id}
    >
      {schema.items.map((item) => (
        <ToolbarItemRenderer
          key={item.id}
          item={item}
          documentId={documentId}
          responsiveMetadata={responsiveMetadata}
        />
      ))}
    </div>
  );
}

/**
 * Renders a single toolbar item
 */
function ToolbarItemRenderer({
  item,
  documentId,
  responsiveMetadata,
}: {
  item: ToolbarItem;
  documentId: string;
  responsiveMetadata: ResponsiveMetadata | null;
}) {
  const itemMetadata = responsiveMetadata?.items.get(item.id) ?? null;
  const responsiveClasses = resolveResponsiveClasses(itemMetadata);

  switch (item.type) {
    case 'command-button':
      return (
        <CommandButtonRenderer
          item={item}
          documentId={documentId}
          responsiveClasses={responsiveClasses}
        />
      );

    case 'tab-group':
      return (
        <TabGroupRenderer
          item={item}
          documentId={documentId}
          responsiveMetadata={responsiveMetadata}
          responsiveClasses={responsiveClasses}
        />
      );

    case 'divider':
      return <DividerRenderer item={item} responsiveClasses={responsiveClasses} />;

    case 'spacer':
      return <SpacerRenderer item={item} />;

    case 'group':
      return (
        <GroupRenderer
          item={item}
          documentId={documentId}
          responsiveMetadata={responsiveMetadata}
          responsiveClasses={responsiveClasses}
        />
      );

    case 'custom':
      return (
        <CustomComponentRenderer
          item={item}
          documentId={documentId}
          responsiveClasses={responsiveClasses}
        />
      );

    default:
      console.warn(`Unknown toolbar item type:`, item);
      return null;
  }
}

/**
 * Renders a command button
 */
function CommandButtonRenderer({
  item,
  documentId,
  responsiveClasses,
}: {
  item: Extract<ToolbarItem, { type: 'command-button' }>;
  documentId: string;
  responsiveClasses: string;
}) {
  const variantClasses = getVariantClasses(item.variant);

  return (
    <div className={twMerge(variantClasses, responsiveClasses)} data-item-id={item.id}>
      <CommandButton
        commandId={item.commandId}
        documentId={documentId}
        variant={item.variant}
        itemId={item.id} // Pass item ID for anchor registry
      />
    </div>
  );
}

/**
 * Renders a tab group
 */
function TabGroupRenderer({
  item,
  documentId,
  responsiveClasses,
  responsiveMetadata,
}: {
  item: Extract<ToolbarItem, { type: 'tab-group' }>;
  documentId: string;
  responsiveClasses: string;
  responsiveMetadata: ResponsiveMetadata | null;
}) {
  const alignmentClass = getAlignmentClass(item.alignment);

  return (
    <div
      className={twMerge('flex items-center', alignmentClass, responsiveClasses)}
      data-item-id={item.id}
      role="tablist"
    >
      <div className="flex rounded-lg bg-gray-100 p-1">
        {item.tabs.map((tab) => {
          // Get responsive metadata for each tab
          const tabMetadata = responsiveMetadata?.items.get(tab.id) ?? null;
          const tabResponsiveClasses = resolveResponsiveClasses(tabMetadata);

          if (!tab.commandId) {
            return null;
          }

          return (
            <div key={tab.id} className={twMerge(tabResponsiveClasses)} data-tab-id={tab.id}>
              <CommandTabButton
                commandId={tab.commandId}
                documentId={documentId}
                itemId={tab.id}
                variant={tab.variant === 'icon' ? 'icon' : 'text'}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Renders a divider
 */
function DividerRenderer({
  item,
  responsiveClasses,
}: {
  item: Extract<ToolbarItem, { type: 'divider' }>;
  responsiveClasses: string;
}) {
  return (
    <div className={twMerge(responsiveClasses)} data-item-id={item.id}>
      <ToolbarDivider orientation={item.orientation} data-item-id={item.id} />
    </div>
  );
}

/**
 * Renders a spacer
 */
function SpacerRenderer({ item }: { item: Extract<ToolbarItem, { type: 'spacer' }> }) {
  return <div className={item.flex ? 'flex-1' : 'w-4'} data-item-id={item.id} aria-hidden="true" />;
}

/**
 * Renders a group of items
 */
function GroupRenderer({
  item,
  documentId,
  responsiveClasses,
  responsiveMetadata,
}: {
  item: Extract<ToolbarItem, { type: 'group' }>;
  documentId: string;
  responsiveClasses: string;
  responsiveMetadata: ResponsiveMetadata | null;
}) {
  const gapClass = item.gap ? `gap-${item.gap}` : 'gap-2';
  const alignmentClass = getAlignmentClass(item.alignment);

  return (
    <div
      className={twMerge(`flex items-center`, gapClass, alignmentClass, responsiveClasses)}
      data-item-id={item.id}
    >
      {item.items.map((childItem) => (
        <ToolbarItemRenderer
          key={childItem.id}
          item={childItem}
          documentId={documentId}
          responsiveMetadata={responsiveMetadata}
        />
      ))}
    </div>
  );
}

/**
 * Renders a custom component from the registry
 */
function CustomComponentRenderer({
  item,
  documentId,
  responsiveClasses,
}: {
  item: Extract<ToolbarItem, { type: 'custom' }>;
  documentId: string;
  responsiveClasses: string;
}) {
  const { renderCustomComponent } = useItemRenderer();

  return (
    <div className={twMerge(responsiveClasses)} data-item-id={item.id}>
      {renderCustomComponent(item.componentId, documentId, item.props)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────

/**
 * Get placement classes for toolbar positioning
 */
function getPlacementClasses(placement: 'top' | 'bottom' | 'left' | 'right'): string {
  switch (placement) {
    case 'top':
      return 'border-b border-gray-300 bg-white px-3 py-2';
    case 'bottom':
      return 'border-t border-gray-300 bg-white px-3 py-2';
    case 'left':
      return 'border-r border-gray-300 bg-white px-2 py-3 flex-col';
    case 'right':
      return 'border-l border-gray-300 bg-white px-2 py-3 flex-col';
  }
}

/**
 * Get variant classes for command buttons
 */
function getVariantClasses(variant?: 'icon' | 'text' | 'icon-text' | 'tab'): string {
  // Tab variant gets special styling
  if (variant === 'tab') {
    return 'toolbar-tab';
  }
  return '';
}

/**
 * Get alignment class for groups
 */
function getAlignmentClass(alignment?: 'start' | 'center' | 'end'): string {
  switch (alignment) {
    case 'start':
      return 'justify-start';
    case 'center':
      return 'justify-center';
    case 'end':
      return 'justify-end';
    default:
      return 'justify-start';
  }
}
