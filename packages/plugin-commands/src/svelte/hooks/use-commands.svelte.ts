import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { CommandsPlugin, ResolvedCommand } from '@embedpdf/plugin-commands';

export const useCommandsCapability = () => useCapability<CommandsPlugin>(CommandsPlugin.id);
export const useCommandsPlugin = () => usePlugin<CommandsPlugin>(CommandsPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseCommandReturn {
  command: ResolvedCommand | null;
}

/**
 * Hook to get a reactive command for a specific document
 * @param getCommandId Function that returns the command ID
 * @param getDocumentId Function that returns the document ID
 */
export const useCommand = (
  getCommandId: () => string,
  getDocumentId: () => string,
): UseCommandReturn => {
  const capability = useCommandsCapability();

  let command = $state<ResolvedCommand | null>(null);

  // Reactive commandId and documentId
  const commandId = $derived(getCommandId());
  const documentId = $derived(getDocumentId());

  $effect(() => {
    const provides = capability.provides;
    const cmdId = commandId;
    const docId = documentId;

    if (!provides || !cmdId || !docId) {
      command = null;
      return;
    }

    command = provides.resolve(cmdId, docId);

    return provides.onCommandStateChanged((event) => {
      if (event.commandId === cmdId && event.documentId === docId) {
        command = provides.resolve(cmdId, docId);
      }
    });
  });

  return {
    get command() {
      return command;
    },
  };
};
