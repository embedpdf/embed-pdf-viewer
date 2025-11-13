import { useCommand } from '@embedpdf/plugin-commands/react';
import { useRegisterAnchor } from '@embedpdf/plugin-ui/react';
import { ToolbarButton } from './ui';
import * as Icons from './icons';

type CommandButtonProps = {
  commandId: string;
  documentId: string;
  variant?: 'icon' | 'text' | 'icon-text' | 'tab';
  itemId?: string; // Unique ID for this button instance (for anchor registry)
  className?: string;
};

/**
 * A button that executes a command when clicked.
 * Uses the useCommand hook to get the command state and execution function.
 * The icon is automatically retrieved from the command definition.
 *
 * Automatically registers itself with the anchor registry so menus can anchor to it.
 */
export function CommandButton({
  commandId,
  documentId,
  variant = 'icon',
  itemId,
  className,
}: CommandButtonProps) {
  const command = useCommand(commandId, documentId);
  // Register this button with the anchor registry if itemId is provided
  // This allows menus to anchor to it when opened via UI state changes
  const finalItemId = itemId || commandId;
  const anchorRef = useRegisterAnchor(documentId, finalItemId);

  if (!command) return null;

  // Get the icon component from the command's icon property
  // Add 'Icon' suffix to match the exported icon component names
  const iconName = command.icon ? `${command.icon}Icon` : null;
  const IconComponent = iconName ? Icons[iconName as keyof typeof Icons] : null;

  // Get iconProps if available (for dynamic colors, etc.)
  const iconProps = command.iconProps || {};

  return (
    <ToolbarButton
      ref={anchorRef}
      onClick={() => command.execute()}
      isActive={command.active}
      disabled={command.disabled || !command.visible}
      aria-label={command.label}
      title={command.label}
      className={className}
    >
      {variant === 'text' ? (
        <span className="text-sm">{command.label}</span>
      ) : variant === 'icon-text' ? (
        <>
          {IconComponent && (
            <IconComponent
              className="mr-2 h-5 w-5"
              title={command.label}
              style={{ color: iconProps.primaryColor }}
            />
          )}
          <span>{command.label}</span>
        </>
      ) : variant === 'tab' ? (
        <span className="px-3 py-1">{command.label}</span>
      ) : // Default: icon only
      IconComponent ? (
        <IconComponent
          className="h-5 w-5"
          title={command.label}
          style={{
            color: iconProps.primaryColor,
            fill: iconProps.secondaryColor,
          }}
        />
      ) : (
        <span>{command.label}</span>
      )}
    </ToolbarButton>
  );
}
