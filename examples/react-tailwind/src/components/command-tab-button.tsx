import { useCommand } from '@embedpdf/plugin-commands/react';
import { useRegisterAnchor } from '@embedpdf/plugin-ui/react';
import { twMerge } from 'tailwind-merge';
import * as Icons from './icons';

type CommandTabButtonProps = {
  commandId: string;
  documentId: string;
  itemId?: string; // Unique ID for this button instance (for anchor registry)
  variant?: 'text' | 'icon';
};

/**
 * A tab button that executes a command when clicked.
 * Styled to match the modern tab design with rounded background and active state.
 *
 * Automatically registers itself with the anchor registry so menus can anchor to it.
 */
export function CommandTabButton({
  commandId,
  documentId,
  itemId,
  variant = 'text',
}: CommandTabButtonProps) {
  const command = useCommand(commandId, documentId);

  // Register this button with the anchor registry if itemId is provided
  const finalItemId = itemId || commandId;
  const anchorRef = useRegisterAnchor(documentId, finalItemId);

  if (!command || !command.visible) return null;

  // Get the icon component from the command's icon property
  const iconName = command.icon ? `${command.icon}Icon` : null;
  const IconComponent = iconName ? Icons[iconName as keyof typeof Icons] : null;
  const iconProps = command.iconProps || {};

  const baseClasses = `rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50`;
  const activeClasses = command.active
    ? 'bg-white text-gray-900 shadow-sm'
    : 'text-gray-600 hover:text-gray-900';

  const sizeClasses = variant === 'icon' ? 'p-1.5' : 'px-4 py-1';

  return (
    <button
      ref={anchorRef}
      onClick={() => command.execute()}
      disabled={command.disabled}
      className={twMerge(baseClasses, activeClasses, sizeClasses)}
      aria-label={command.label}
      title={command.label}
      role="tab"
      aria-selected={command.active}
    >
      {variant === 'icon' && IconComponent ? (
        <IconComponent
          className="h-5 w-5"
          title={command.label}
          style={{
            color: iconProps.primaryColor,
            fill: iconProps.secondaryColor,
          }}
        />
      ) : (
        <span className="text-sm font-medium">{command.label}</span>
      )}
    </button>
  );
}
