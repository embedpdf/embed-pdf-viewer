<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import EmbedPDF, {
    type EmbedPdfContainer,
    type PDFViewerConfig,
    type PluginRegistry,
  } from '@embedpdf/snippet';

  interface Props {
    /** Full configuration for the PDF viewer */
    config?: PDFViewerConfig;
    /** CSS class for the container element */
    class?: string;
    /** Inline styles for the container element */
    style?: string;
    /** Callback when the viewer container is initialized */
    oninit?: (container: EmbedPdfContainer) => void;
    /** Callback when the plugin registry is ready */
    onready?: (registry: PluginRegistry) => void;
  }

  let { config = {}, class: className = '', style = '', oninit, onready }: Props = $props();

  let container: EmbedPdfContainer | null = null;
  let containerEl: HTMLDivElement;
  const dispatch = createEventDispatcher<{
    init: EmbedPdfContainer;
    ready: PluginRegistry;
  }>();

  onMount(() => {
    const viewer = EmbedPDF.init({
      type: 'container',
      target: containerEl,
      ...config,
    });

    if (viewer) {
      container = viewer;
      oninit?.(viewer);
      dispatch('init', viewer);

      viewer.registry.then((reg) => {
        onready?.(reg);
        dispatch('ready', reg);
      });
    }
  });

  onDestroy(() => {
    if (container && containerEl) {
      containerEl.innerHTML = '';
      container = null;
    }
  });
</script>

<div bind:this={containerEl} class={className} {style}></div>
