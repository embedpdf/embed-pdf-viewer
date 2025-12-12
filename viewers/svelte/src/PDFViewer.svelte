<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import EmbedPDF, {
    type EmbedPdfContainer,
    type PDFViewerConfig,
    type PluginRegistry,
  } from '@embedpdf/snippet';

  /** Full configuration for the PDF viewer */
  export let config: PDFViewerConfig = {};

  /** Exposed bindings for accessing the viewer */
  export let container: EmbedPdfContainer | null = null;
  export let registry: Promise<PluginRegistry> | null = null;

  const dispatch = createEventDispatcher<{
    init: EmbedPdfContainer;
    ready: PluginRegistry;
  }>();

  let containerEl: HTMLDivElement;

  onMount(() => {
    // Initialize the viewer with the config prop
    const viewer = EmbedPDF.init({
      type: 'container',
      target: containerEl,
      ...config,
    });

    if (viewer) {
      container = viewer;
      registry = viewer.registry;
      dispatch('init', viewer);

      // Dispatch ready when registry is available
      viewer.registry.then((reg) => {
        dispatch('ready', reg);
      });
    }
  });

  onDestroy(() => {
    // Cleanup: remove the viewer element
    if (container && containerEl) {
      containerEl.innerHTML = '';
      container = null;
      registry = null;
    }
  });
</script>

<div bind:this={containerEl} class={$$props.class} style={$$props.style} />
