<script lang="ts">
  import { PdfAnnotationBorderStyle, type Rect } from '@embedpdf/models';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface CircleProps {
    isSelected: boolean;
    color?: string;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    strokeStyle?: PdfAnnotationBorderStyle;
    strokeDashArray?: number[];
    rect: Rect;
    scale: number;
    onClick?: (e: PointerEvent | TouchEvent) => void;
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
  }: CircleProps = $props();

  const { width, height, cx, cy, rx, ry } = $derived.by(() => {
    const outerW = rect.size.width;
    const outerH = rect.size.height;
    const innerW = Math.max(outerW - strokeWidth, 0);
    const innerH = Math.max(outerH - strokeWidth, 0);

    return {
      width: outerW,
      height: outerH,
      cx: strokeWidth / 2 + innerW / 2,
      cy: strokeWidth / 2 + innerH / 2,
      rx: innerW / 2,
      ry: innerH / 2,
    };
  });

  let svgWidth = $derived(width * scale);
  let svgHeight = $derived(height * scale);
  let hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));

  let peValue = $derived(
    isSelected ? 'none' : color === 'transparent' ? 'visibleStroke' : 'visible',
  );
</script>

<svg
  style:position="absolute"
  style:width={`${svgWidth}px`}
  style:height={`${svgHeight}px`}
  style:pointer-events="none"
  style:z-index="2"
  width={svgWidth}
  height={svgHeight}
  viewBox={`0 0 ${width} ${height}`}
  overflow="visible"
>
  <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <ellipse
    {cx}
    {cy}
    {rx}
    {ry}
    fill="transparent"
    stroke="transparent"
    stroke-width={hitStrokeWidth}
    onpointerdown={(e) => onClick?.(e)}
    ontouchstart={(e) => onClick?.(e)}
    style:cursor={isSelected ? 'move' : 'pointer'}
    pointer-events={peValue}
  />
  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    <ellipse
      {cx}
      {cy}
      {rx}
      {ry}
      fill={color}
      {opacity}
      style:pointer-events="none"
      stroke={strokeColor ?? color}
      stroke-width={strokeWidth}
      stroke-dasharray={strokeStyle === PdfAnnotationBorderStyle.DASHED
        ? strokeDashArray?.join(',')
        : undefined}
    />
  {/if}
</svg>
