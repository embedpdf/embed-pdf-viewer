import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import {
  resolveResponsiveMetadata,
  ResponsiveMetadata,
  ToolbarItem,
  ToolbarRendererProps,
  useItemRenderer,
} from '@embedpdf/plugin-ui/preact';
import { useLocale } from '@embedpdf/plugin-i18n/preact';
import { useCommand } from '@embedpdf/plugin-commands/preact';
import { twMerge } from 'tailwind-merge';
import { TabButton } from '@/components/ui/TabButton';
import { icons } from '@/components/icons';
import { CommandButton } from '@/components/command-button';

/**
 * Schema-driven Toolbar Renderer for Preact
 *
 * Renders a toolbar based on a ToolbarSchema definition from the UI plugin.
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
  return (
    <div className={responsiveClasses} data-item-id={item.id}>
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
  responsiveClasses,
  responsiveMetadata,
}: {
  item: Extract<ToolbarItem, { type: 'tab-group' }>;
  documentId: string;
  responsiveClasses: string;
  responsiveMetadata: ResponsiveMetadata | null;
}) {
  return (
    <div
      className={twMerge('flex items-center gap-2', responsiveClasses)}
      data-item-id={item.id}
      role="tablist"
    >
      {item.tabs.map((tab) => {
        const tabMetadata = responsiveMetadata?.items.get(tab.id) ?? null;
        const tabResponsiveClasses = resolveResponsiveClasses(tabMetadata);

        if (!tab.commandId) {
          return null;
        }

        const command = useCommand(tab.commandId, documentId);
        if (!command || !command.visible) return null;

        const handleClick = () => {
          if (!command.disabled) {
            command.execute();
          }
        };

        return (
          <div key={tab.id} className={tabResponsiveClasses} data-tab-id={tab.id}>
            <TabButton active={command.active} onClick={handleClick} disabled={command.disabled}>
              {tab.variant === 'text' ? command.label : null}
              {tab.variant === 'icon' && command.icon
                ? (() => {
                    const TabIconComponent = icons[command.icon];
                    return TabIconComponent ? (
                      <TabIconComponent
                        className="h-5 w-5"
                        primaryColor={command.iconProps?.primaryColor}
                        secondaryColor={command.iconProps?.secondaryColor}
                      />
                    ) : null;
                  })()
                : null}
            </TabButton>
          </div>
        );
      })}
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
    <div className={responsiveClasses} data-item-id={item.id}>
      <div
        className={
          item.orientation === 'vertical' ? 'h-6 w-px bg-gray-300' : 'h-px w-6 bg-gray-300'
        }
        data-item-id={item.id}
      />
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
      className={`flex items-center ${gapClass} ${alignmentClass} ${responsiveClasses}`}
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
    <div className={responsiveClasses} data-item-id={item.id}>
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
      return 'border-b border-gray-300 bg-white px-4 py-2';
    case 'bottom':
      return 'border-t border-gray-300 bg-white px-4 py-2';
    case 'left':
      return 'border-r border-gray-300 bg-white px-2 py-3 flex-col';
    case 'right':
      return 'border-l border-gray-300 bg-white px-2 py-3 flex-col';
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

/**
 * Resolve responsive classes from metadata
 */
function resolveResponsiveClasses(itemMetadata: any): string {
  if (!itemMetadata) return '';
  if (itemMetadata.hidden) return 'hidden';
  return '';
}
