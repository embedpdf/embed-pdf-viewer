import { h, CSSProperties } from 'preact';
import {
  SelectionMenuRendererProps,
  SelectionMenuItem,
  SelectionMenuPropsBase,
  getUIItemProps,
} from '@embedpdf/plugin-ui/preact';
import { useCommand } from '@embedpdf/plugin-commands/preact';
import { CommandButton } from '../components/command-button';

export function SchemaSelectionMenu({ schema, documentId, props }: SelectionMenuRendererProps) {
  const { menuWrapperProps, rect, placement } = props;

  // Calculate position
  const menuStyle: CSSProperties = {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'default',
    left: '50%',
    transform: 'translateX(-50%)',
  };

  if (placement?.suggestTop) {
    menuStyle.top = -40 - 8;
  } else {
    menuStyle.top = rect.size.height + 8;
  }

  return (
    <div {...menuWrapperProps} {...getUIItemProps(schema)}>
      <div
        style={menuStyle}
        className="border-border-subtle bg-bg-elevated rounded-lg border shadow-lg"
      >
        <div className="flex items-center gap-1 p-1">
          {schema.items.map((item) => (
            <SelectionMenuItemRenderer
              key={item.id}
              item={item}
              documentId={documentId}
              props={props}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper component for command buttons that checks visibility before rendering.
 * This ensures the wrapper div is not rendered when the command is hidden.
 */
function CommandButtonItem({
  item,
  documentId,
}: {
  item: SelectionMenuItem & { type: 'command-button' };
  documentId: string;
}) {
  const command = useCommand(item.commandId, documentId);

  // Don't render wrapper div if command is hidden
  if (!command?.visible) return null;

  return (
    <div {...getUIItemProps(item)}>
      <CommandButton commandId={item.commandId} documentId={documentId} variant={item.variant} />
    </div>
  );
}

function SelectionMenuItemRenderer({
  item,
  documentId,
  props,
}: {
  item: SelectionMenuItem;
  documentId: string;
  props: SelectionMenuPropsBase;
}) {
  switch (item.type) {
    case 'command-button':
      return <CommandButtonItem item={item} documentId={documentId} />;

    case 'divider':
      return (
        <div {...getUIItemProps(item)}>
          <div className="bg-border-default h-6 w-px" aria-hidden="true" />
        </div>
      );

    case 'group':
      return (
        <div className={`flex items-center gap-${item.gap ?? 1}`} {...getUIItemProps(item)}>
          {item.items.map((child) => (
            <SelectionMenuItemRenderer
              key={child.id}
              item={child}
              documentId={documentId}
              props={props}
            />
          ))}
        </div>
      );

    default:
      return null;
  }
}
