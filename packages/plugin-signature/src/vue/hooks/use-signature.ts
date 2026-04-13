import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { SignaturePlugin, SignatureEntry, ActivePlacementInfo } from '@embedpdf/plugin-signature';
import { ref, watch, toValue, type MaybeRefOrGetter } from 'vue';

export const useSignaturePlugin = () => usePlugin<SignaturePlugin>(SignaturePlugin.id);
export const useSignatureCapability = () => useCapability<SignaturePlugin>(SignaturePlugin.id);

export const useSignatureEntries = () => {
  const { provides } = useSignatureCapability();
  const entries = ref<SignatureEntry[]>([]);

  watch(
    provides,
    (capability, _, onCleanup) => {
      if (!capability) {
        entries.value = [];
        return;
      }

      entries.value = capability.getEntries();
      const unsubscribe = capability.onEntriesChange((updated) => {
        entries.value = updated;
      });
      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return { entries };
};

export const useActivePlacement = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useSignatureCapability();
  const activePlacement = ref<ActivePlacementInfo | null>(null);

  watch(
    [provides, () => toValue(documentId)],
    ([capability, docId], _, onCleanup) => {
      if (!capability || !docId) {
        activePlacement.value = null;
        return;
      }

      const scope = capability.forDocument(docId);
      activePlacement.value = scope.getActivePlacement();
      const unsubscribe = scope.onActivePlacementChange((placement) => {
        activePlacement.value = placement;
      });
      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return activePlacement;
};
