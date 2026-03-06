<script lang="ts">
  import type { PdfInkListObject, Rect } from '@embedpdf/models';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface InkProps {
    isSelected: boolean;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    inkList: PdfInkListObject[];
    rect: Rect;
    scale: number;
    onClick?: (e: MouseEvent) => void;
    appearanceActive?: boolean;
  }

  let {
    isSelected,
    strokeColor,
    opacity = 1,
    strokeWidth,
    inkList,
    rect,
    scale,
    onClick,
    appearanceActive = false,
  }: InkProps = $props();

  const resolvedColor = $derived(strokeColor ?? '#000000');

  const paths = $derived.by(() =>
    inkList.map(({ points }) => {
      let d = '';
      for (let i = 0; i < points.length; i++) {
        const { x, y } = points[i];
        const lx = x - rect.origin.x;
        const ly = y - rect.origin.y;
        d += (i === 0 ? 'M' : 'L') + lx + ' ' + ly + ' ';
      }
      return d.trim();
    }),
  );

  const width = $derived(rect.size.width * scale);
  const height = $derived(rect.size.height * scale);
  const hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));
</script>

<svg
  style="position: absolute; z-index: 2; overflow: visible; pointer-events: none;"
  style:width={`${width}px`}
  style:height={`${height}px`}
  {width}
  {height}
  viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
>
  <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
  {#each paths as d, i (`hit-${i}`)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <path
      {d}
      fill="none"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      style:cursor={isSelected ? 'move' : 'pointer'}
      style:pointer-events={isSelected ? 'none' : 'visibleStroke'}
      style:stroke-linecap="round"
      style:stroke-linejoin="round"
    />
  {/each}
  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    {#each paths as d, i (`vis-${i}`)}
      <path
        {d}
        fill="none"
        {opacity}
        style:pointer-events="none"
        style:stroke={resolvedColor}
        style:stroke-width={strokeWidth}
        style:stroke-linecap="round"
        style:stroke-linejoin="round"
      />
    {/each}
  {/if}
</svg>
