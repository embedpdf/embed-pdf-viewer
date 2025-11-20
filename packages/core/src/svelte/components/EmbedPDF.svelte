<script lang="ts">
  import type { Logger, PdfEngine } from '@embedpdf/models';
  import { type IPlugin, type PluginBatchRegistrations, PluginRegistry } from '@embedpdf/core';
  import { type Snippet } from 'svelte';
  import AutoMount from './AutoMount.svelte';
  import { pdfContext, type PDFContextState } from '../hooks';

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
    children: Snippet<[PDFContextState]>;
    /**
     * Whether to auto-mount specific non-visual DOM elements from plugins.
     * @default true
     */
    autoMountDomElements?: boolean;
  }

  let {
    engine,
    logger,
    onInitialized,
    plugins,
    children,
    autoMountDomElements = true,
  }: EmbedPDFProps = $props();

  let latestInit = onInitialized;

  $effect(() => {
    if (onInitialized) {
      latestInit = onInitialized;
    }
  });

  $effect(() => {
    if (engine || (engine && plugins)) {
      const reg = new PluginRegistry(engine, { logger });
      reg.registerPluginBatch(plugins);

      const initialize = async () => {
        await reg.initialize();

        // if the registry is destroyed, don't do anything
        if (reg.isDestroyed()) {
          return;
        }

        const store = reg.getStore();
        pdfContext.coreState = store.getState().core;

        const unsubscribe = store.subscribe((action, newState, oldState) => {
          // Only update if it's a core action and the core state changed
          if (store.isCoreAction(action) && newState.core !== oldState.core) {
            pdfContext.coreState = newState.core;

            // Update convenience accessors
            const activeDocumentId = newState.core.activeDocumentId ?? null;
            const documents = newState.core.documents ?? {};
            const documentOrder = newState.core.documentOrder ?? [];

            pdfContext.activeDocumentId = activeDocumentId;
            pdfContext.activeDocument =
              activeDocumentId && documents[activeDocumentId] ? documents[activeDocumentId] : null;
            pdfContext.documents = documents;
            pdfContext.documentStates = documentOrder
              .map((docId) => documents[docId])
              .filter(
                (doc): doc is import('@embedpdf/core').DocumentState =>
                  doc !== null && doc !== undefined,
              );
          }
        });

        /* always call the *latest* callback */
        await latestInit?.(reg);

        // if the registry is destroyed, don't do anything
        if (reg.isDestroyed()) {
          unsubscribe();
          return;
        }

        reg.pluginsReady().then(() => {
          if (!reg.isDestroyed()) {
            pdfContext.pluginsReady = true;
          }
        });

        // Provide the registry to children via context
        pdfContext.registry = reg;
        pdfContext.isInitializing = false;

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
        reg.destroy();
        pdfContext.registry = null;
        pdfContext.coreState = null;
        pdfContext.isInitializing = true;
        pdfContext.pluginsReady = false;
        pdfContext.activeDocumentId = null;
        pdfContext.activeDocument = null;
        pdfContext.documents = {};
        pdfContext.documentStates = [];
      };
    }
  });
</script>

{#if pdfContext.pluginsReady && autoMountDomElements}
  <AutoMount {plugins}>{@render children(pdfContext)}</AutoMount>
{:else}
  {@render children(pdfContext)}
{/if}
