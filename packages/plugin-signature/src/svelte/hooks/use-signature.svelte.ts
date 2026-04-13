import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { SignaturePlugin } from '@embedpdf/plugin-signature';
import type { SignatureEntry, ActivePlacementInfo } from '@embedpdf/plugin-signature';

export const useSignaturePlugin = () => usePlugin<SignaturePlugin>(SignaturePlugin.id);
export const useSignatureCapability = () => useCapability<SignaturePlugin>(SignaturePlugin.id);

export function useSignatureEntries() {
  const capability = useSignatureCapability();
  let entries = $state<SignatureEntry[]>([]);

  $effect(() => {
    if (!capability.provides) {
      entries = [];
      return;
    }

    entries = capability.provides.getEntries();
    return capability.provides.onEntriesChange((updated) => {
      entries = updated;
    });
  });

  return {
    get entries() {
      return entries;
    },
  };
}

export function useActivePlacement(getDocumentId: () => string) {
  const capability = useSignatureCapability();
  let activePlacement = $state<ActivePlacementInfo | null>(null);
  const documentId = $derived(getDocumentId());

  $effect(() => {
    if (!capability.provides || !documentId) {
      activePlacement = null;
      return;
    }

    const scope = capability.provides.forDocument(documentId);
    activePlacement = scope.getActivePlacement();
    return scope.onActivePlacementChange((placement) => {
      activePlacement = placement;
    });
  });

  return {
    get activePlacement() {
      return activePlacement;
    },
  };
}
