<script lang="ts">
  import type { Rect, LinePoints, LineEndings } from '@embedpdf/models';
  import { PdfAnnotationBorderStyle } from '@embedpdf/models';
  import { patching } from '@embedpdf/plugin-annotation';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface LineProps {
    color?: string;
    opacity?: number;
    strokeWidth: number;
    strokeColor?: string;
    strokeStyle?: PdfAnnotationBorderStyle;
    strokeDashArray?: number[];
    rect: Rect;
    linePoints: LinePoints;
    lineEndings?: LineEndings;
    scale: number;
    onClick?: (e: MouseEvent) => void;
    isSelected: boolean;
    appearanceActive?: boolean;
  }

  let {
    color = 'transparent',
    opacity = 1,
    strokeWidth,
    strokeColor = '#000000',
    strokeStyle = PdfAnnotationBorderStyle.SOLID,
    strokeDashArray,
    rect,
    linePoints,
    lineEndings,
    scale,
    onClick,
    isSelected,
    appearanceActive = false,
  }: LineProps = $props();

  const x1 = $derived(linePoints.start.x - rect.origin.x);
  const y1 = $derived(linePoints.start.y - rect.origin.y);
  const x2 = $derived(linePoints.end.x - rect.origin.x);
  const y2 = $derived(linePoints.end.y - rect.origin.y);

  const endings = $derived.by(() => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    return {
      start: patching.createEnding(lineEndings?.start, strokeWidth, angle + Math.PI, x1, y1),
      end: patching.createEnding(lineEndings?.end, strokeWidth, angle, x2, y2),
    };
  });

  const width = $derived(rect.size.width * scale);
  const height = $derived(rect.size.height * scale);
  const hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));

  const dash = $derived(
    strokeStyle === PdfAnnotationBorderStyle.DASHED ? strokeDashArray?.join(',') : undefined,
  );
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <line
    {x1}
    {y1}
    {x2}
    {y2}
    stroke="transparent"
    stroke-width={hitStrokeWidth}
    onpointerdown={onClick}
    style:cursor={isSelected ? 'move' : 'pointer'}
    style:pointer-events={isSelected ? 'none' : 'visibleStroke'}
    style:stroke-linecap="butt"
  />
  {#if endings.start}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <path
      d={endings.start.d}
      transform={endings.start.transform}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      style:cursor={isSelected ? 'move' : 'pointer'}
      style:pointer-events={isSelected
        ? 'none'
        : endings.start.filled
          ? 'visible'
          : 'visibleStroke'}
      style:stroke-linecap="butt"
    />
  {/if}
  {#if endings.end}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <path
      d={endings.end.d}
      transform={endings.end.transform}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      style:cursor={isSelected ? 'move' : 'pointer'}
      style:pointer-events={isSelected ? 'none' : endings.end.filled ? 'visible' : 'visibleStroke'}
      style:stroke-linecap="butt"
    />
  {/if}

  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    <line
      {x1}
      {y1}
      {x2}
      {y2}
      {opacity}
      style:pointer-events="none"
      style:stroke={strokeColor}
      style:stroke-width={strokeWidth}
      style:stroke-linecap="butt"
      style:stroke-dasharray={dash}
    />
    {#if endings.start}
      <path
        d={endings.start.d}
        transform={endings.start.transform}
        stroke={strokeColor}
        fill={endings.start.filled ? color : 'none'}
        style:pointer-events="none"
        style:stroke-width={strokeWidth}
        style:stroke-linecap="butt"
        style:stroke-dasharray={dash}
      />
    {/if}
    {#if endings.end}
      <path
        d={endings.end.d}
        transform={endings.end.transform}
        stroke={strokeColor}
        fill={endings.end.filled ? color : 'none'}
        style:pointer-events="none"
        style:stroke-width={strokeWidth}
        style:stroke-linecap="butt"
        style:stroke-dasharray={dash}
      />
    {/if}
  {/if}
</svg>
