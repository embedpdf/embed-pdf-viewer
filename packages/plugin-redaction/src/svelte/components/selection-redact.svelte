<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { useRedactionPlugin } from '../hooks/use-redaction.svelte';
  import Highlight from './highlight.svelte';

  interface SelectionRedactProps {
    documentId: string;
    pageIndex: number;
    scale: number;
  }

  let { documentId, pageIndex, scale }: SelectionRedactProps = $props();

  const redactionPlugin = useRedactionPlugin();
  let rects = $state<Rect[]>([]);
  let boundingRect = $state<Rect | null>(null);

  // Get stroke color from plugin (annotation mode uses tool defaults, legacy uses red)
  const strokeColor = $derived(redactionPlugin.plugin?.getPreviewStrokeColor() ?? 'red');

  $effect(() => {
    if (!redactionPlugin.plugin) {
      rects = [];
      boundingRect = null;
      return;
    }

    return redactionPlugin.plugin.onRedactionSelectionChange(documentId, (formattedSelection) => {
      const selection = formattedSelection.find((s) => s.pageIndex === pageIndex);
      rects = selection?.segmentRects ?? [];
      boundingRect = selection?.rect ?? null;
    });
  });
</script>

{#if boundingRect}
  <div
    style:mix-blend-mode="normal"
    style:pointer-events="none"
    style:position="absolute"
    style:inset="0"
  >
    <Highlight
      color="transparent"
      opacity={1}
      {rects}
      {scale}
      border={`1px solid ${strokeColor}`}
    />
  </div>
{/if}
