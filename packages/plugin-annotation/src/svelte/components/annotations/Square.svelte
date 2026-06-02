<script lang="ts">
  import type { Rect, PdfRectDifferences, PdfMeasurementInfo } from '@embedpdf/models';
  import { PdfAnnotationBorderStyle, formatMeasurement, rectArea } from '@embedpdf/models';
  import { generateCloudyRectanglePath } from '@embedpdf/plugin-annotation';
  import MeasurementLabel from './MeasurementLabel.svelte';
  import AreaHatch from './AreaHatch.svelte';

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
    cloudyBorderIntensity?: number;
    rectangleDifferences?: PdfRectDifferences;
    measurement?: PdfMeasurementInfo;
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
    measurement,
  }: SquareProps = $props();

  const isCloudy = $derived((cloudyBorderIntensity ?? 0) > 0);

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

  const cloudyPath = $derived.by(() => {
    if (!isCloudy) return null;
    return generateCloudyRectanglePath(
      { x: 0, y: 0, width: rect.size.width, height: rect.size.height },
      rectangleDifferences,
      cloudyBorderIntensity!,
      strokeWidth,
    );
  });

  const svgWidth = $derived((width + strokeWidth) * scale);
  const svgHeight = $derived((height + strokeWidth) * scale);
  const hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));

  const dash = $derived(
    strokeStyle === PdfAnnotationBorderStyle.DASHED ? strokeDashArray?.join(',') : undefined,
  );

  const measureText = $derived(measurement ? formatMeasurement(rectArea(rect), measurement) : null);
  const isAreaMeasure = $derived(measurement?.mode === 'area');
  const hatchId = 'mhatch-' + Math.random().toString(36).slice(2, 9);
  const fillValue = $derived(isAreaMeasure ? `url(#${hatchId})` : color);
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
  {#if isCloudy && cloudyPath}
    <path
      d={cloudyPath.path}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      style:cursor={isSelected ? 'move' : onClick ? 'pointer' : 'default'}
      style:pointer-events={!onClick
        ? 'none'
        : isSelected
          ? 'none'
          : color === 'transparent'
            ? 'visibleStroke'
            : 'visible'}
    />
  {:else}
    <rect
      {x}
      {y}
      {width}
      {height}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      style:cursor={isSelected ? 'move' : onClick ? 'pointer' : 'default'}
      style:pointer-events={!onClick
        ? 'none'
        : isSelected
          ? 'none'
          : color === 'transparent'
            ? 'visibleStroke'
            : 'visible'}
    />
  {/if}
  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    {#if isAreaMeasure}
      <AreaHatch id={hatchId} color={strokeColor ?? '#2962FF'} {scale} />
    {/if}
    {#if isCloudy && cloudyPath}
      <path
        d={cloudyPath.path}
        fill={fillValue}
        {opacity}
        style:pointer-events="none"
        style:stroke={strokeColor ?? color}
        style:stroke-width={strokeWidth}
        stroke-linejoin="round"
      />
    {:else}
      <rect
        {x}
        {y}
        {width}
        {height}
        fill={fillValue}
        {opacity}
        style:pointer-events="none"
        style:stroke={strokeColor ?? color}
        style:stroke-width={strokeWidth}
        style:stroke-dasharray={dash}
      />
    {/if}
  {/if}

  {#if measureText}
    <MeasurementLabel
      text={measureText}
      center={{ x: rect.size.width / 2, y: rect.size.height / 2 }}
      {scale}
      background={strokeColor ?? '#2962FF'}
    />
  {/if}
</svg>
