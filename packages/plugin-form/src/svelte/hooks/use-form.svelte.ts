import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { FormPlugin, FormDocumentState, initialDocumentState } from '@embedpdf/plugin-form';

export const useFormPlugin = () => usePlugin<FormPlugin>(FormPlugin.id);
export const useFormCapability = () => useCapability<FormPlugin>(FormPlugin.id);

export const useFormDocumentState = (getDocumentId: () => string) => {
  const formCapability = useFormCapability();
  let state = $state<FormDocumentState>({ ...initialDocumentState });
  const documentId = $derived(getDocumentId());

  $effect(() => {
    if (!formCapability.provides || !documentId) {
      state = { ...initialDocumentState };
      return;
    }

    const scope = formCapability.provides.forDocument(documentId);
    state = scope.getState();

    return scope.onStateChange((newState) => {
      state = newState;
    });
  });

  return {
    get state() {
      return state;
    },
  };
};
