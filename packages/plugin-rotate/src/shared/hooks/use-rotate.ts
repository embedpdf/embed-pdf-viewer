import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { Rotation } from '@embedpdf/models';
import { initialDocumentState, RotatePlugin } from '@embedpdf/plugin-rotate';
import { useEffect, useState } from '@framework';

export const useRotatePlugin = () => usePlugin<RotatePlugin>(RotatePlugin.id);
export const useRotateCapability = () => useCapability<RotatePlugin>(RotatePlugin.id);

/**
 * Hook for rotation state for a specific document
 * @param documentId Document ID
 */
export const useRotate = (documentId: string) => {
  const { provides } = useRotateCapability();
  const [rotation, setRotation] = useState<Rotation>(initialDocumentState.rotation);

  useEffect(() => {
    if (!provides) return;

    const scope = provides.forDocument(documentId);

    // Get initial state
    setRotation(scope.getRotation());

    // Subscribe to rotation changes
    return scope.onRotateChange((newRotation) => {
      setRotation(newRotation);
    });
  }, [provides, documentId]);

  return {
    rotation,
    provides: provides?.forDocument(documentId) ?? null,
  };
};
