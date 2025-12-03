import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { CommandsPlugin, ResolvedCommand } from '@embedpdf/plugin-commands';
import { useState, useEffect } from '@framework';

export const useCommandsCapability = () => useCapability<CommandsPlugin>(CommandsPlugin.id);
export const useCommandsPlugin = () => usePlugin<CommandsPlugin>(CommandsPlugin.id);

/**
 * Hook to get a reactive command for a specific document
 * Automatically updates when command state changes
 * @param commandId Command ID
 * @param documentId Document ID
 * @returns ResolvedCommand or null if not available
 */
export const useCommand = (commandId: string, documentId: string): ResolvedCommand | null => {
  const { provides } = useCommandsCapability();
  const [command, setCommand] = useState<ResolvedCommand | null>(() =>
    provides ? provides.resolve(commandId, documentId) : null,
  );

  useEffect(() => {
    if (!provides) {
      setCommand(null);
      return;
    }

    // Initial resolve
    setCommand(provides.resolve(commandId, documentId));

    // Subscribe to state changes for this command + document
    const unsubscribe = provides.onCommandStateChanged((event) => {
      if (event.commandId === commandId && event.documentId === documentId) {
        setCommand(provides.resolve(commandId, documentId));
      }
    });

    return unsubscribe;
  }, [provides, commandId, documentId]);

  return command;
};

/**
 * Hook to execute a command
 */
export const useCommandExecutor = (documentId: string) => {
  const { provides } = useCommandsCapability();

  return (commandId: string) => {
    if (provides) {
      provides.execute(commandId, documentId, 'ui');
    }
  };
};
