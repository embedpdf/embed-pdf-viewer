import { ref, watch, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { FormPlugin, FormDocumentState, initialDocumentState } from '@embedpdf/plugin-form';

export const useFormPlugin = () => usePlugin<FormPlugin>(FormPlugin.id);
export const useFormCapability = () => useCapability<FormPlugin>(FormPlugin.id);

export const useFormDocumentState = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useFormCapability();
  const state = ref<FormDocumentState>({ ...initialDocumentState });

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (providesValue && docId) {
        const scope = providesValue.forDocument(docId);
        state.value = scope.getState();

        const unsubscribe = scope.onStateChange((newState) => {
          state.value = newState;
        });
        onCleanup(unsubscribe);
      } else {
        state.value = { ...initialDocumentState };
      }
    },
    { immediate: true },
  );

  return {
    state,
    provides: computed(() => provides.value?.forDocument(toValue(documentId)) ?? null),
  };
};
