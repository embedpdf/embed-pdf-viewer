import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { SignaturePlugin, SignatureEntry, ActivePlacementInfo } from '@embedpdf/plugin-signature';
import { useState, useEffect } from '@framework';

export const useSignaturePlugin = () => usePlugin<SignaturePlugin>(SignaturePlugin.id);
export const useSignatureCapability = () => useCapability<SignaturePlugin>(SignaturePlugin.id);

export const useSignatureEntries = () => {
  const { provides } = useSignatureCapability();
  const [entries, setEntries] = useState<SignatureEntry[]>(provides?.getEntries() ?? []);

  useEffect(() => {
    if (!provides) return;
    setEntries(provides.getEntries());
    return provides.onEntriesChange((updated) => {
      setEntries(updated);
    });
  }, [provides]);

  return { entries, provides };
};

export const useActivePlacement = (documentId: string) => {
  const { provides } = useSignatureCapability();
  const [activePlacement, setActivePlacement] = useState<ActivePlacementInfo | null>(null);

  useEffect(() => {
    if (!provides) return;
    const scope = provides.forDocument(documentId);
    setActivePlacement(scope.getActivePlacement());
    return scope.onActivePlacementChange(setActivePlacement);
  }, [provides, documentId]);

  return activePlacement;
};
