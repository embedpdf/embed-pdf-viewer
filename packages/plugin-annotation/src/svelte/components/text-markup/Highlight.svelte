<script lang="ts">
  import type { Quad, Rect } from '@embedpdf/models';
  import {
    quadBoundsRelativeToContainer,
    quadClipPath,
    resolveTextMarkupSegments,
  } from '../../../shared/components/text-markup/quad-geometry';

  interface HighlightProps {
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
  }: HighlightProps = $props();

  const resolvedColor = $derived(strokeColor ?? '#FFFF00');
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
    style:background={appearanceActive ? 'transparent' : resolvedColor}
    style:opacity={appearanceActive ? undefined : opacity}
    style:clip-path={appearanceActive ? undefined : quadClipPath(segment, rect, scale)}
    style:pointer-events={onClick ? 'auto' : 'none'}
    style:cursor={onClick ? 'pointer' : 'default'}
    style:z-index={onClick ? 1 : undefined}
    {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
  ></div>
{/each}
