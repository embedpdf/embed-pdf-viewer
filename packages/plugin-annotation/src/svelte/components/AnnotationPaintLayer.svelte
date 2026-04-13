<script lang="ts">
  import { useAnnotationPlugin } from '../hooks';
  import type { PreviewState, HandlerServices } from '@embedpdf/plugin-annotation';
  import PreviewRenderer from './PreviewRenderer.svelte';

  interface AnnotationPaintLayerProps {
    documentId: string;
    pageIndex: number;
    scale: number;
  }

  let { documentId, pageIndex, scale }: AnnotationPaintLayerProps = $props();

  const annotationPlugin = useAnnotationPlugin();
  let previews = $state<Map<string, PreviewState>>(new Map());

  let fileInputRef: HTMLInputElement | null = $state(null);

  const services: HandlerServices = {
    requestFile: ({ accept, onFile }) => {
      if (!fileInputRef) return;
      const input = fileInputRef;
      input.accept = accept;
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          onFile(file);
          input.value = '';
        }
      };
      input.click();
    },
  };

  $effect(() => {
    if (!annotationPlugin.plugin) return;

    return annotationPlugin.plugin.registerPageHandlers(documentId, pageIndex, scale, {
      services,
      onPreview: (toolId, state) => {
        previews = new Map(previews);
        if (state) {
          previews.set(toolId, state);
        } else {
          previews.delete(toolId);
        }
      },
    });
  });
</script>

<input bind:this={fileInputRef} type="file" style:display="none" />

<!-- Render any active previews from any tool -->
{#each Array.from(previews.entries()) as [toolId, preview] (toolId)}
  <PreviewRenderer {toolId} {preview} {scale} />
{/each}
