<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import { PdfAnnotationBorderStyle } from '@embedpdf/models';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface SquareProps {
    isSelected: boolean;
    color?: string;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    strokeStyle?: PdfAnnotationBorderStyle;
    strokeDashArray?: number[];
    rect: Rect;
    scale: number;
    onClick?: (e: MouseEvent) => void;
    appearanceActive?: boolean;
  }

  let {
    isSelected,
    color = '#000000',
    strokeColor,
    opacity = 1,
    strokeWidth,
    strokeStyle = PdfAnnotationBorderStyle.SOLID,
    strokeDashArray,
    rect,
    scale,
    onClick,
    appearanceActive = false,
  }: SquareProps = $props();

  const { width, height, x, y } = $derived.by(() => {
    const outerW = rect.size.width;
    const outerH = rect.size.height;
    const innerW = Math.max(outerW - strokeWidth, 0);
    const innerH = Math.max(outerH - strokeWidth, 0);
    return {
      width: innerW,
      height: innerH,
      x: strokeWidth / 2,
      y: strokeWidth / 2,
    };
  });

  const svgWidth = $derived((width + strokeWidth) * scale);
  const svgHeight = $derived((height + strokeWidth) * scale);
  const hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));

  const dash = $derived(
    strokeStyle === PdfAnnotationBorderStyle.DASHED ? strokeDashArray?.join(',') : undefined,
  );
</script>

<svg
  style="position: absolute; pointer-events: none; z-index: 2;"
  style:width={`${svgWidth}px`}
  style:height={`${svgHeight}px`}
  width={svgWidth}
  height={svgHeight}
  viewBox={`0 0 ${width + strokeWidth} ${height + strokeWidth}`}
  overflow="visible"
>
  <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <rect
    {x}
    {y}
    {width}
    {height}
    fill="transparent"
    stroke="transparent"
    stroke-width={hitStrokeWidth}
    onpointerdown={onClick}
    style:cursor={isSelected ? 'move' : 'pointer'}
    style:pointer-events={isSelected
      ? 'none'
      : color === 'transparent'
        ? 'visibleStroke'
        : 'visible'}
  />
  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    <rect
      {x}
      {y}
      {width}
      {height}
      fill={color}
      {opacity}
      style:pointer-events="none"
      style:stroke={strokeColor ?? color}
      style:stroke-width={strokeWidth}
      style:stroke-dasharray={dash}
    />
  {/if}
</svg>
