import { ref, watch, readonly, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { CommandsPlugin, ResolvedCommand } from '@embedpdf/plugin-commands';

export const useCommandsCapability = () => useCapability<CommandsPlugin>(CommandsPlugin.id);
export const useCommandsPlugin = () => usePlugin<CommandsPlugin>(CommandsPlugin.id);

/**
 * Hook to get a reactive command for a specific document
 * @param commandId Command ID (can be ref, computed, getter, or plain value)
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useCommand = (
  commandId: MaybeRefOrGetter<string>,
  documentId: MaybeRefOrGetter<string>,
) => {
  const { provides } = useCommandsCapability();
  const command = ref<ResolvedCommand | null>(null);

  watch(
    [provides, () => toValue(commandId), () => toValue(documentId)],
    ([providesValue, cmdId, docId], _, onCleanup) => {
      if (!providesValue) {
        command.value = null;
        return;
      }

      command.value = providesValue.resolve(cmdId, docId);

      const unsubscribe = providesValue.onCommandStateChanged((event) => {
        if (event.commandId === cmdId && event.documentId === docId) {
          command.value = providesValue.resolve(cmdId, docId);
        }
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return readonly(command);
};
