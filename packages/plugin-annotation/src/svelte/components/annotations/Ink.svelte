<script lang="ts">
  import type { PdfInkListObject, Rect } from '@embedpdf/models';

  interface InkProps {
    isSelected: boolean;
    /** Stroke color */
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    inkList: PdfInkListObject[];
    rect: Rect;
    scale: number;
    onClick?: (e: MouseEvent | TouchEvent) => void;
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
  }: InkProps = $props();

  const resolvedColor = $derived(strokeColor ?? '#000000');

  // derived SVG path data
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
</script>

<svg
  style="position: absolute; z-index: 2; overflow: visible; pointer-events: none;"
  style:width={`${width}px`}
  style:height={`${height}px`}
  {width}
  {height}
  viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
>
  {#each paths as d, i (i)}
    <path
      {d}
      fill="none"
      {opacity}
      onpointerdown={onClick}
      ontouchstart={onClick}
      style:cursor={isSelected ? 'move' : 'pointer'}
      style:pointer-events={isSelected ? 'none' : 'visibleStroke'}
      style:stroke={resolvedColor}
      style:stroke-width={strokeWidth}
      style:stroke-linecap="round"
      style:stroke-linejoin="round"
    />
  {/each}
</svg>
