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

        /* always call the *latest* callback */
        await latestInit?.(reg);

        // if the registry is destroyed, don't do anything
        if (reg.isDestroyed()) {
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
      };
      initialize().catch(console.error);

      return () => {
        reg.destroy();
        pdfContext.registry = null;
        pdfContext.isInitializing = false;
        pdfContext.pluginsReady = false;
      };
    }
  });
</script>

{#if pdfContext.pluginsReady && autoMountDomElements}
  <AutoMount {plugins}>{@render children(pdfContext)}</AutoMount>
{:else}
  {@render children(pdfContext)}
{/if}
