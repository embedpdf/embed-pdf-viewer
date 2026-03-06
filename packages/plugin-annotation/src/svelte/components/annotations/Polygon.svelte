<script lang="ts">
  import type { Rect, Position } from '@embedpdf/models';
  import { PdfAnnotationBorderStyle } from '@embedpdf/models';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface PolygonProps {
    rect: Rect;
    vertices: Position[];
    color?: string;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    strokeStyle?: PdfAnnotationBorderStyle;
    strokeDashArray?: number[];
    scale: number;
    isSelected: boolean;
    onClick?: (e: MouseEvent) => void;
    currentVertex?: Position;
    handleSize?: number;
    appearanceActive?: boolean;
  }

  let {
    rect,
    vertices,
    color = 'transparent',
    strokeColor = '#000000',
    opacity = 1,
    strokeWidth,
    strokeStyle = PdfAnnotationBorderStyle.SOLID,
    strokeDashArray,
    scale,
    isSelected,
    onClick,
    currentVertex,
    handleSize = 14,
    appearanceActive = false,
  }: PolygonProps = $props();

  const allPoints = $derived(currentVertex ? [...vertices, currentVertex] : vertices);

  const localPts = $derived(
    allPoints.map(({ x, y }) => ({ x: x - rect.origin.x, y: y - rect.origin.y })),
  );

  const pathData = $derived.by(() => {
    if (!localPts.length) return '';
    const [first, ...rest] = localPts;
    const isPreview = !!currentVertex;
    return (
      `M ${first.x} ${first.y} ` +
      rest.map((p) => `L ${p.x} ${p.y}`).join(' ') +
      (isPreview ? '' : ' Z')
    ).trim();
  });

  const isPreviewing = $derived(!!currentVertex && vertices.length > 0);

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
  <path
    d={pathData}
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
    style:stroke-linecap="butt"
    style:stroke-linejoin="miter"
  />

  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    <path
      d={pathData}
      {opacity}
      style:fill={currentVertex ? 'none' : color}
      style:stroke={strokeColor ?? color}
      style:stroke-width={strokeWidth}
      style:pointer-events="none"
      style:stroke-linecap="butt"
      style:stroke-linejoin="miter"
      style:stroke-dasharray={dash}
    />

    {#if isPreviewing && vertices.length > 1}
      <path
        d={`M ${localPts[localPts.length - 1].x} ${localPts[localPts.length - 1].y} L ${localPts[0].x} ${localPts[0].y}`}
        fill="none"
        style:stroke={strokeColor}
        style:stroke-width={strokeWidth}
        style:stroke-dasharray={'4,4'}
        style:opacity={0.7}
        style:pointer-events="none"
      />
    {/if}

    {#if isPreviewing && vertices.length >= 2}
      <rect
        x={localPts[0].x - handleSize / scale / 2}
        y={localPts[0].y - handleSize / scale / 2}
        width={handleSize / scale}
        height={handleSize / scale}
        fill={strokeColor}
        opacity={0.4}
        stroke={strokeColor}
        stroke-width={strokeWidth / 2}
        style:pointer-events="none"
      />
    {/if}
  {/if}
</svg>
