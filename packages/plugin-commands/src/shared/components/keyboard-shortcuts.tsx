import { useEffect } from '@framework';
import { useCommandsCapability } from '../hooks';
import { createKeyDownHandler } from '../utils';

/**
 * Utility component that listens to keyboard events
 * and executes commands based on shortcuts.
 * This component doesn't render anything, it just sets up keyboard shortcuts.
 */
export function KeyboardShortcuts() {
  const { provides: commands } = useCommandsCapability();

  useEffect(() => {
    if (!commands) return;

    const handleKeyDown = createKeyDownHandler(commands);

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [commands]);

  // This component is only used to set up keyboard shortcuts when the plugin is initialized.
  return null;
}
