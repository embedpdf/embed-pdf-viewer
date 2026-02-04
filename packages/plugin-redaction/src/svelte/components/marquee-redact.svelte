<script lang="ts">
  import { useDocumentState } from '@embedpdf/core/svelte';
  import type { Rect } from '@embedpdf/models';
  import { useRedactionPlugin } from '../hooks/use-redaction.svelte';

  interface MarqueeRedactProps {
    /** The ID of the document */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page */
    scale?: number;
    /** Optional CSS class applied to the marquee rectangle */
    className?: string;
    /** Stroke / fill colours (defaults below) */
    stroke?: string;
    fill?: string;
  }

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    className = '',
    stroke,
    fill = 'transparent',
  }: MarqueeRedactProps = $props();

  const redactionPlugin = useRedactionPlugin();
  const documentState = useDocumentState(() => documentId);
  let rect = $state<Rect | null>(null);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  // Get stroke color from plugin (annotation mode uses tool defaults, legacy uses red)
  // Allow prop override for backwards compatibility
  const strokeColor = $derived(stroke ?? redactionPlugin.plugin?.getPreviewStrokeColor() ?? 'red');

  $effect(() => {
    if (!redactionPlugin.plugin || !documentId) {
      rect = null;
      return;
    }

    return redactionPlugin.plugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      callback: {
        onPreview: (newRect) => {
          rect = newRect;
        },
      },
    });
  });
</script>

{#if rect}
  <div
    class={className}
    style:position="absolute"
    style:pointer-events="none"
    style:left={`${rect.origin.x * actualScale}px`}
    style:top={`${rect.origin.y * actualScale}px`}
    style:width={`${rect.size.width * actualScale}px`}
    style:height={`${rect.size.height * actualScale}px`}
    style:border={`1px solid ${strokeColor}`}
    style:background={fill}
    style:box-sizing="border-box"
  ></div>
{/if}
