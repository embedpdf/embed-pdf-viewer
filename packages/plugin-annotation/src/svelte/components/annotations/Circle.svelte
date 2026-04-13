<script lang="ts">
  import { PdfAnnotationBorderStyle, type PdfRectDifferences, type Rect } from '@embedpdf/models';
  import { generateCloudyEllipsePath } from '@embedpdf/plugin-annotation';

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
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
    cloudyBorderIntensity?: number;
    rectangleDifferences?: PdfRectDifferences;
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
    cloudyBorderIntensity,
    rectangleDifferences,
  }: CircleProps = $props();

  const isCloudy = $derived((cloudyBorderIntensity ?? 0) > 0);

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

  const cloudyPath = $derived.by(() => {
    if (!isCloudy) return null;
    return generateCloudyEllipsePath(
      { x: 0, y: 0, width: rect.size.width, height: rect.size.height },
      rectangleDifferences,
      cloudyBorderIntensity!,
      strokeWidth,
    );
  });

  let svgWidth = $derived(width * scale);
  let svgHeight = $derived(height * scale);
  let hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));

  let peValue = $derived(
    !onClick ? 'none' : isSelected ? 'none' : color === 'transparent' ? 'visibleStroke' : 'visible',
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
  {#if isCloudy && cloudyPath}
    <path
      d={cloudyPath.path}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={(e) => onClick?.(e)}
      style:cursor={isSelected ? 'move' : onClick ? 'pointer' : 'default'}
      pointer-events={peValue}
    />
  {:else}
    <ellipse
      {cx}
      {cy}
      {rx}
      {ry}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={(e) => onClick?.(e)}
      style:cursor={isSelected ? 'move' : onClick ? 'pointer' : 'default'}
      pointer-events={peValue}
    />
  {/if}
  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    {#if isCloudy && cloudyPath}
      <path
        d={cloudyPath.path}
        fill={color}
        {opacity}
        style:pointer-events="none"
        stroke={strokeColor ?? color}
        stroke-width={strokeWidth}
        stroke-linejoin="round"
      />
    {:else}
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
  {/if}
</svg>
