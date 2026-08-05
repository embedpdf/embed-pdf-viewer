<script lang="ts">
  import type { Quad, Rect } from '@embedpdf/models';
  import {
    quadBoundsRelativeToContainer,
    resolveTextMarkupSegments,
    strikeoutSegmentPath,
  } from '../../../shared/components/text-markup/quad-geometry';

  interface StrikeoutProps {
    strokeColor?: string;
    opacity?: number;
    segmentRects: Rect[];
    segmentQuads?: Quad[];
    rect?: Rect;
    scale: number;
    onClick?: (e: MouseEvent) => void;
    style?: Record<string, string | number | undefined>;
    appearanceActive?: boolean;
  }

  let {
    strokeColor,
    opacity = 0.5,
    segmentRects,
    segmentQuads,
    rect,
    scale,
    onClick,
    style,
    appearanceActive = false,
  }: StrikeoutProps = $props();

  const resolvedColor = $derived(strokeColor ?? '#FFFF00');
  const thickness = $derived(2 * scale);
  const segments = $derived(resolveTextMarkupSegments(segmentRects, segmentQuads));
</script>

{#each segments as segment, i (i)}
  {@const bounds = quadBoundsRelativeToContainer(segment, rect, scale)}
  <div
    role="button"
    tabindex={onClick ? 0 : -1}
    onpointerdown={onClick}
    style:position="absolute"
    style:left="{bounds.left}px"
    style:top="{bounds.top}px"
    style:width="{bounds.width}px"
    style:height="{bounds.height}px"
    style:background="transparent"
    style:pointer-events={onClick ? 'auto' : 'none'}
    style:cursor={onClick ? 'pointer' : 'default'}
    style:z-index={onClick ? 1 : 0}
    {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
  >
    {#if !appearanceActive}
      <svg
        style:position="absolute"
        style:left="0"
        style:top="0"
        style:width="100%"
        style:height="100%"
        style:overflow="visible"
        style:pointer-events="none"
      >
        <path
          d={strikeoutSegmentPath(segment, rect, scale)}
          stroke={resolvedColor}
          stroke-width={thickness}
          fill="none"
          {opacity}
        />
      </svg>
    {/if}
  </div>
{/each}
