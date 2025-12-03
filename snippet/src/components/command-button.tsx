import { h, Fragment } from 'preact';
import { useCommand } from '@embedpdf/plugin-commands/preact';
import { useRegisterAnchor } from '@embedpdf/plugin-ui/preact';
import { twMerge } from 'tailwind-merge';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { icons } from './icons';

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
  const finalItemId = itemId || commandId;
  const anchorRef = useRegisterAnchor(documentId, finalItemId);

  if (!command || !command.visible) return null;

  // Get the icon component from the icons object
  const IconComponent = command.icon ? icons[command.icon] : null;
  const iconProps = command.iconProps || {};

  const handleClick = () => {
    if (!command.disabled) {
      command.execute();
    }
  };

  return (
    <Tooltip
      content={command.label}
      position="bottom"
      delay={500}
      trigger={command.active ? 'none' : 'hover'}
    >
      <Button
        elementRef={anchorRef}
        onClick={handleClick}
        active={command.active}
        disabled={command.disabled}
        className={className || 'p-1'}
        aria-label={command.label}
      >
        {variant === 'text' ? (
          <span className="text-sm">{command.label}</span>
        ) : variant === 'icon-text' ? (
          <>
            {IconComponent && (
              <IconComponent
                className={`mr-2 h-5 w-5`}
                primaryColor={iconProps.primaryColor}
                secondaryColor={iconProps.secondaryColor}
              />
            )}
            <span>{command.label}</span>
          </>
        ) : variant === 'tab' ? (
          <span className="px-3 py-1">{command.label}</span>
        ) : IconComponent ? (
          <IconComponent
            className={twMerge('h-5 w-5', iconProps.className)}
            primaryColor={iconProps.primaryColor}
            secondaryColor={iconProps.secondaryColor}
          />
        ) : (
          <span>{command.label}</span>
        )}
      </Button>
    </Tooltip>
  );
}
