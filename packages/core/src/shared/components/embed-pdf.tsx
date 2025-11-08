import { useState, useEffect, useRef, ReactNode } from '@framework';
import { Logger, PdfEngine } from '@embedpdf/models';
import { PluginRegistry } from '@embedpdf/core';
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
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [pluginsReady, setPluginsReady] = useState<boolean>(false);
  const initRef = useRef<EmbedPDFProps['onInitialized']>(onInitialized);

  useEffect(() => {
    initRef.current = onInitialized; // update without triggering re-runs
  }, [onInitialized]);

  useEffect(() => {
    const pdfViewer = new PluginRegistry(engine, { logger });
    pdfViewer.registerPluginBatch(plugins);

    const initialize = async () => {
      await pdfViewer.initialize();
      // if the registry is destroyed, don't do anything
      if (pdfViewer.isDestroyed()) {
        return;
      }

      /* always call the *latest* callback */
      await initRef.current?.(pdfViewer);

      // if the registry is destroyed, don't do anything
      if (pdfViewer.isDestroyed()) {
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
    };

    initialize().catch(console.error);

    return () => {
      pdfViewer.destroy();
      setRegistry(null);
      setIsInitializing(true);
      setPluginsReady(false);
    };
  }, [engine, plugins]);

  const content =
    typeof children === 'function'
      ? children({ registry, isInitializing, pluginsReady })
      : children;

  return (
    <PDFContext.Provider value={{ registry, isInitializing, pluginsReady }}>
      {pluginsReady && autoMountDomElements ? (
        <AutoMount plugins={plugins}>{content}</AutoMount>
      ) : (
        content
      )}
    </PDFContext.Provider>
  );
}
