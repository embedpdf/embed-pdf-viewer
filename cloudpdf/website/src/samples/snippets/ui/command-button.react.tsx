import { useCommand } from '@embedpdf/react/commands';
import { Icon } from './icon';

export function CommandButton({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command?.visible) return null;

  return (
    <button onClick={command.run} disabled={!command.enabled} aria-pressed={command.active}>
      <Icon name={command.icon} />
      {command.label}
      {command.shortcut && <kbd>{command.shortcut}</kbd>}
    </button>
  );
}
