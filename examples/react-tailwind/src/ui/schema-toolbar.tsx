import {
  ToolbarItem,
  ToolbarRendererProps,
  useItemRenderer,
  getUIItemProps,
} from '@embedpdf/plugin-ui/react';
import { CommandButton } from '../components/command-button';
import { CommandTabButton } from '../components/command-tab-button';
import { ToolbarDivider } from '../components/ui';
import { twMerge } from 'tailwind-merge';

/**
 * Schema-driven Toolbar Renderer
 *
 * Renders a toolbar based on a ToolbarSchema definition from the UI plugin.
 * Visibility is controlled entirely by CSS via data attributes.
 */
export function SchemaToolbar({
  schema,
  documentId,
  isOpen,
  className = '',
}: ToolbarRendererProps) {
  if (!isOpen) {
    return null;
  }

  const isSecondarySlot = schema.position.slot === 'secondary';
  const placementClasses = getPlacementClasses(schema.position.placement);
  const slotClasses = isSecondarySlot ? 'bg-[#f1f3f5]' : '';

  return (
    <div
      className={twMerge('flex items-center gap-2', placementClasses, slotClasses, className)}
      {...getUIItemProps(schema)}
    >
      {schema.items.map((item) => (
        <ToolbarItemRenderer key={item.id} item={item} documentId={documentId} />
      ))}
    </div>
  );
}

/**
 * Renders a single toolbar item
 */
function ToolbarItemRenderer({ item, documentId }: { item: ToolbarItem; documentId: string }) {
  switch (item.type) {
    case 'command-button':
      return <CommandButtonRenderer item={item} documentId={documentId} />;

    case 'tab-group':
      return <TabGroupRenderer item={item} documentId={documentId} />;

    case 'divider':
      return <DividerRenderer item={item} />;

    case 'spacer':
      return <SpacerRenderer item={item} />;

    case 'group':
      return <GroupRenderer item={item} documentId={documentId} />;

    case 'custom':
      return <CustomComponentRenderer item={item} documentId={documentId} />;

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
}: {
  item: Extract<ToolbarItem, { type: 'command-button' }>;
  documentId: string;
}) {
  const variantClasses = getVariantClasses(item.variant);

  return (
    <div className={variantClasses} {...getUIItemProps(item)}>
      <CommandButton
        commandId={item.commandId}
        documentId={documentId}
        variant={item.variant}
        itemId={item.id}
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
}: {
  item: Extract<ToolbarItem, { type: 'tab-group' }>;
  documentId: string;
}) {
  const alignmentClass = getAlignmentClass(item.alignment);

  return (
    <div
      className={twMerge('flex items-center', alignmentClass)}
      {...getUIItemProps(item)}
      role="tablist"
    >
      <div className="flex rounded-lg bg-gray-100 p-1">
        {item.tabs.map((tab) => {
          if (!tab.commandId) {
            return null;
          }

          return (
            <div key={tab.id} {...getUIItemProps(tab)}>
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
function DividerRenderer({ item }: { item: Extract<ToolbarItem, { type: 'divider' }> }) {
  return (
    <div {...getUIItemProps(item)}>
      <ToolbarDivider orientation={item.orientation} />
    </div>
  );
}

/**
 * Renders a spacer
 */
function SpacerRenderer({ item }: { item: Extract<ToolbarItem, { type: 'spacer' }> }) {
  return (
    <div className={item.flex ? 'flex-1' : 'w-4'} {...getUIItemProps(item)} aria-hidden="true" />
  );
}

/**
 * Renders a group of items
 */
function GroupRenderer({
  item,
  documentId,
}: {
  item: Extract<ToolbarItem, { type: 'group' }>;
  documentId: string;
}) {
  const gapClass = item.gap ? `gap-${item.gap}` : 'gap-2';
  const alignmentClass = getAlignmentClass(item.alignment);

  return (
    <div
      className={twMerge('flex items-center', gapClass, alignmentClass)}
      {...getUIItemProps(item)}
    >
      {item.items.map((childItem) => (
        <ToolbarItemRenderer key={childItem.id} item={childItem} documentId={documentId} />
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
}: {
  item: Extract<ToolbarItem, { type: 'custom' }>;
  documentId: string;
}) {
  const { renderCustomComponent } = useItemRenderer();

  return (
    <div {...getUIItemProps(item)}>
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
