<script lang="ts">
  import type { Rect } from '@embedpdf/models';

  interface HighlightProps {
    color?: string;
    opacity?: number;
    border?: string;
    rects: Rect[];
    rect?: Rect;
    scale: number;
    onClick?: (e: MouseEvent | TouchEvent) => void;
    style?: string;
  }

  let {
    color = '#FFFF00',
    opacity = 1,
    border = '1px solid red',
    rects,
    rect,
    scale,
    onClick,
    style = '',
  }: HighlightProps = $props();

  // Rename rect to boundingRect for clarity
  const boundingRect = $derived(rect);
</script>

{#each rects as b, i (i)}
  <div
    onpointerdown={onClick}
    ontouchstart={onClick}
    style:position="absolute"
    style:border
    style:left={`${(boundingRect ? b.origin.x - boundingRect.origin.x : b.origin.x) * scale}px`}
    style:top={`${(boundingRect ? b.origin.y - boundingRect.origin.y : b.origin.y) * scale}px`}
    style:width={`${b.size.width * scale}px`}
    style:height={`${b.size.height * scale}px`}
    style:background={color}
    style:opacity
    style:pointer-events={onClick ? 'auto' : 'none'}
    style:cursor={onClick ? 'pointer' : 'default'}
    style:z-index={onClick ? '1' : undefined}
    {style}
  ></div>
{/each}
