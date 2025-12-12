import { h, Fragment } from 'preact';
import {
  ToolbarItem,
  ToolbarRendererProps,
  useItemRenderer,
  useRegisterAnchor,
  getUIItemProps,
} from '@embedpdf/plugin-ui/preact';
import { useCommand } from '@embedpdf/plugin-commands/preact';
import { twMerge } from 'tailwind-merge';
import { TabButton } from '@/components/ui/tab-button';
import { Icon } from '@/components/ui/icon';
import { CommandButton } from '@/components/command-button';

// No more responsive-utils import needed!
// CSS handles all responsive and category visibility

/**
 * Schema-driven Toolbar Renderer for Preact
 *
 * Renders a toolbar based on a ToolbarSchema definition from the UI plugin.
 *
 * Visibility is controlled entirely by CSS:
 * - Responsive: Container queries based on data-ui-item attribute
 * - Categories: data-categories attribute matched against data-disabled-categories on root
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
  const slotClasses = isSecondarySlot ? 'bg-bg-surface-alt' : '';

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
  return (
    <div {...getUIItemProps(item)}>
      <CommandButton
        commandId={item.commandId}
        documentId={documentId}
        itemId={item.id}
        variant={item.variant}
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
  return (
    <div className="flex items-center gap-2" {...getUIItemProps(item)} role="tablist">
      {item.tabs.map((tab) => (
        <TabRenderer key={tab.id} tab={tab} documentId={documentId} />
      ))}
    </div>
  );
}

/**
 * Renders a single tab within a tab group
 */
function TabRenderer({
  tab,
  documentId,
}: {
  tab: Extract<ToolbarItem, { type: 'tab-group' }>['tabs'][number];
  documentId: string;
}) {
  const command = useCommand(tab.commandId, documentId);
  const anchorRef = useRegisterAnchor(documentId, tab.id);

  // Don't render if command doesn't exist or isn't visible
  if (!command || !command.visible) {
    return null;
  }

  const handleClick = () => {
    if (!command.disabled) {
      command.execute();
    }
  };

  return (
    <div {...getUIItemProps(tab)}>
      <TabButton
        anchorRef={anchorRef}
        active={command.active}
        onClick={handleClick}
        disabled={command.disabled}
      >
        {tab.variant === 'text' && command.label}
        {tab.variant === 'icon' && command.icon && (
          <TabIcon icon={command.icon} iconProps={command.iconProps} />
        )}
        {tab.variant === 'icon-text' && (
          <>
            {command.icon && <TabIcon icon={command.icon} iconProps={command.iconProps} />}
            {command.label}
          </>
        )}
      </TabButton>
    </div>
  );
}

/**
 * Renders a tab icon
 */
function TabIcon({
  icon,
  iconProps,
}: {
  icon: string;
  iconProps?: { primaryColor?: string; secondaryColor?: string };
}) {
  return (
    <Icon
      icon={icon}
      className="h-5 w-5"
      primaryColor={iconProps?.primaryColor}
      secondaryColor={iconProps?.secondaryColor}
    />
  );
}

/**
 * Renders a divider
 */
function DividerRenderer({ item }: { item: Extract<ToolbarItem, { type: 'divider' }> }) {
  return (
    <div {...getUIItemProps(item)}>
      <div
        className={
          item.orientation === 'vertical'
            ? 'bg-border-default h-6 w-px'
            : 'bg-border-default h-px w-6'
        }
        aria-hidden="true"
      />
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
      return 'border-b border-border-default bg-bg-surface px-4 py-2';
    case 'bottom':
      return 'border-t border-border-default bg-bg-surface px-4 py-2';
    case 'left':
      return 'border-r border-border-default bg-bg-surface px-2 py-3 flex-col';
    case 'right':
      return 'border-l border-border-default bg-bg-surface px-2 py-3 flex-col';
  }
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
