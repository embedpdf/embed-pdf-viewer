import { h, CSSProperties } from 'preact';
import {
  SelectionMenuRendererProps,
  SelectionMenuItem,
  SelectionMenuPropsBase,
  getUIItemProps,
} from '@embedpdf/plugin-ui/preact';
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
      <div style={menuStyle} className="rounded-lg border border-gray-200 bg-white shadow-lg">
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
      return (
        <div {...getUIItemProps(item)}>
          <CommandButton
            commandId={item.commandId}
            documentId={documentId}
            variant={item.variant}
          />
        </div>
      );

    case 'divider':
      return (
        <div {...getUIItemProps(item)}>
          <div className="h-6 w-px bg-gray-300" aria-hidden="true" />
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
