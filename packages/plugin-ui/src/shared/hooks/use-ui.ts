import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { UIPlugin } from '@embedpdf/plugin-ui';
import { useState, useEffect } from '@framework';
import { UIDocumentState, UISchema } from '@embedpdf/plugin-ui';

export const useUICapability = () => useCapability<UIPlugin>(UIPlugin.id);
export const useUIPlugin = () => usePlugin<UIPlugin>(UIPlugin.id);

/**
 * Get UI state for a document
 */
export const useUIState = (documentId: string) => {
  const { provides } = useUICapability();
  const [state, setState] = useState<UIDocumentState | null>(null);

  useEffect(() => {
    if (!provides) return;

    const scope = provides.forDocument(documentId);
    setState(scope.getState());

    // Subscribe to changes
    const unsubToolbar = scope.onToolbarChanged(() => setState(scope.getState()));
    const unsubSidebar = scope.onSidebarChanged(() => setState(scope.getState()));
    const unsubModal = scope.onModalChanged(() => setState(scope.getState()));
    const unsubMenu = scope.onMenuChanged(() => setState(scope.getState()));
    const unsubOverlay = scope.onOverlayChanged(() => setState(scope.getState()));

    return () => {
      unsubToolbar();
      unsubSidebar();
      unsubModal();
      unsubMenu();
      unsubOverlay();
    };
  }, [provides, documentId]);

  return state;
};

/**
 * Get UI schema
 */
export const useUISchema = (): UISchema | null => {
  const { provides } = useUICapability();
  return provides?.getSchema() ?? null;
};
