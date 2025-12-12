import { useCommand } from '@embedpdf/plugin-commands/preact';
import { useRegisterAnchor } from '@embedpdf/plugin-ui/preact';
import { h } from 'preact';
import { useCallback, useMemo } from 'preact/hooks';
import { Button } from './ui/button';
import { Icon } from './ui/icon';

interface ModeSelectButtonProps {
  documentId: string;
  className?: string;
}

export function ModeSelectButton({ documentId, className }: ModeSelectButtonProps) {
  const commandView = useCommand('mode:view', documentId);
  const commandAnnotate = useCommand('mode:annotate', documentId);
  const commandShapes = useCommand('mode:shapes', documentId);
  const commandRedact = useCommand('mode:redact', documentId);
  const commandOverflow = useCommand('tabs:overflow-menu', documentId);

  // Find the currently active mode
  const activeCommand = useMemo(() => {
    const commands = [commandView, commandAnnotate, commandShapes, commandRedact];
    return commands.find((cmd) => cmd?.active) || commandView;
  }, [commandView, commandAnnotate, commandShapes, commandRedact]);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (commandOverflow && !commandOverflow.disabled) {
        commandOverflow.execute();
      }
    },
    [commandOverflow],
  );

  // Don't render if overflow command isn't available
  if (!commandOverflow || !commandOverflow.visible) return null;

  const isActive = commandOverflow.active;

  return (
    <div style={{ maxWidth: '100px', width: '100px' }} className={className}>
      <Button
        className={`col-start-1 row-start-1 !w-full appearance-none rounded-md bg-white py-1.5 pl-3 pr-2 text-[13px] text-gray-900 ${
          isActive
            ? 'text-accent outline-accent outline outline-2 -outline-offset-2'
            : 'outline outline-1 -outline-offset-1 outline-gray-300'
        } flex flex-row items-center justify-between gap-2 hover:ring-transparent`}
        onClick={handleClick}
        disabled={commandOverflow.disabled}
        style={{
          height: 34,
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{activeCommand?.label}</span>
        <Icon icon="chevronDown" className="h-4 w-4 text-gray-500" />
      </Button>
    </div>
  );
}
