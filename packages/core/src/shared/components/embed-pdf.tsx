import { useState, useEffect, useRef, useMemo, ReactNode } from '@framework';
import { Logger, PdfEngine } from '@embedpdf/models';
import { PluginRegistry, CoreState, DocumentState } from '@embedpdf/core';
import type { PluginBatchRegistrations } from '@embedpdf/core';

import { PDFContext, PDFContextState } from '../context';
import { AutoMount } from './auto-mount';

export type { PluginBatchRegistrations };

interface EmbedPDFProps {
  /**
   * The PDF engine to use for the PDF viewer.
   */
  engine: PdfEngine;
  /**
   * The logger to use for the PDF viewer.
   */
  logger?: Logger;
  /**
   * The callback to call when the PDF viewer is initialized.
   */
  onInitialized?: (registry: PluginRegistry) => Promise<void>;
  /**
   * The plugins to use for the PDF viewer.
   */
  plugins: PluginBatchRegistrations;
  /**
   * The children to render for the PDF viewer.
   */
  children: ReactNode | ((state: PDFContextState) => ReactNode);
  /**
   * Whether to auto-mount specific non-visual DOM elements from plugins.
   * @default true
   */
  autoMountDomElements?: boolean;
}

export function EmbedPDF({
  engine,
  logger,
  onInitialized,
  plugins,
  children,
  autoMountDomElements = true,
}: EmbedPDFProps) {
  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  const [coreState, setCoreState] = useState<CoreState | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [pluginsReady, setPluginsReady] = useState<boolean>(false);
  const initRef = useRef<EmbedPDFProps['onInitialized']>(onInitialized);

  useEffect(() => {
    initRef.current = onInitialized;
  }, [onInitialized]);

  useEffect(() => {
    const pdfViewer = new PluginRegistry(engine, { logger });
    pdfViewer.registerPluginBatch(plugins);

    const initialize = async () => {
      await pdfViewer.initialize();

      if (pdfViewer.isDestroyed()) {
        return;
      }

      const store = pdfViewer.getStore();
      setCoreState(store.getState().core);

      const unsubscribe = store.subscribe((action, newState, oldState) => {
        // Only update if it's a core action and the core state changed
        if (store.isCoreAction(action) && newState.core !== oldState.core) {
          setCoreState(newState.core);
        }
      });

      /* always call the *latest* callback */
      await initRef.current?.(pdfViewer);

      if (pdfViewer.isDestroyed()) {
        unsubscribe();
        return;
      }

      pdfViewer.pluginsReady().then(() => {
        if (!pdfViewer.isDestroyed()) {
          setPluginsReady(true);
        }
      });

      // Provide the registry to children via context
      setRegistry(pdfViewer);
      setIsInitializing(false);

      // Return cleanup function
      return unsubscribe;
    };

    let cleanup: (() => void) | undefined;
    initialize()
      .then((unsub) => {
        cleanup = unsub;
      })
      .catch(console.error);

    return () => {
      cleanup?.();
      pdfViewer.destroy();
      setRegistry(null);
      setCoreState(null);
      setIsInitializing(true);
      setPluginsReady(false);
    };
  }, [engine, plugins]);

  // Compute convenience accessors
  const contextValue: PDFContextState = useMemo(() => {
    const activeDocumentId = coreState?.activeDocumentId ?? null;
    const documents = coreState?.documents ?? {};
    const documentOrder = coreState?.documentOrder ?? [];

    // Compute active document
    const activeDocument =
      activeDocumentId && documents[activeDocumentId] ? documents[activeDocumentId] : null;

    // Compute open documents in order
    const documentStates = documentOrder
      .map((docId) => documents[docId])
      .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);

    return {
      registry,
      coreState,
      isInitializing,
      pluginsReady,
      // Convenience accessors (always safe to use)
      activeDocumentId,
      activeDocument,
      documents,
      documentStates,
    };
  }, [registry, coreState, isInitializing, pluginsReady]);

  const content = typeof children === 'function' ? children(contextValue) : children;

  return (
    <PDFContext.Provider value={contextValue}>
      {pluginsReady && autoMountDomElements ? (
        <AutoMount plugins={plugins}>{content}</AutoMount>
      ) : (
        content
      )}
    </PDFContext.Provider>
  );
}
