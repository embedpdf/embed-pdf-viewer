<script lang="ts">
  import { PdfAnnotationBorderStyle, type Rect } from '@embedpdf/models';

  interface LinkProps {
    /** Whether the annotation is selected */
    isSelected: boolean;
    /** Stroke colour – defaults to blue when omitted */
    strokeColor?: string;
    /** Stroke width in PDF units */
    strokeWidth?: number;
    /** Stroke type – defaults to underline when omitted */
    strokeStyle?: PdfAnnotationBorderStyle;
    /** Stroke dash array – for dashed style */
    strokeDashArray?: number[];
    /** Bounding box of the annotation (PDF units) */
    rect: Rect;
    /** Current page zoom factor */
    scale: number;
    /** Click handler (used for selection) */
    onClick?: (e: MouseEvent | TouchEvent) => void;
    /** Whether this link has an IRT (In Reply To) reference - disables direct interaction */
    hasIRT?: boolean;
  }

  let {
    isSelected,
    strokeColor = '#0000FF',
    strokeWidth = 2,
    strokeStyle = PdfAnnotationBorderStyle.UNDERLINE,
    strokeDashArray,
    rect,
    scale,
    onClick,
    hasIRT = false,
  }: LinkProps = $props();

  const width = $derived(rect.size.width);
  const height = $derived(rect.size.height);
  const svgWidth = $derived(width * scale);
  const svgHeight = $derived(height * scale);

  // Calculate dash array for SVG
  const dashArray = $derived.by(() => {
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      return strokeDashArray?.join(',') ?? `${strokeWidth * 3},${strokeWidth}`;
    }
    return undefined;
  });

  // For underline style, render a line at the bottom
  // For solid/dashed, render a rectangle border
  const isUnderline = $derived(strokeStyle === PdfAnnotationBorderStyle.UNDERLINE);

  const hitAreaCursor = $derived(hasIRT ? 'default' : isSelected ? 'move' : 'pointer');
  const hitAreaPointerEvents = $derived(hasIRT ? 'none' : isSelected ? 'none' : 'visible');
</script>

<svg
  style="position: absolute; z-index: 2; pointer-events: none;"
  style:width="{svgWidth}px"
  style:height="{svgHeight}px"
  width={svgWidth}
  height={svgHeight}
  viewBox="0 0 {width} {height}"
>
  <!-- Invisible hit area for the entire link region -->
  <!-- IRT links are not directly clickable - interaction goes through parent -->
  <rect
    role="button"
    tabindex={-1}
    x={0}
    y={0}
    {width}
    {height}
    fill="transparent"
    onpointerdown={hasIRT ? undefined : onClick}
    ontouchstart={hasIRT ? undefined : onClick}
    style:cursor={hitAreaCursor}
    style:pointer-events={hitAreaPointerEvents}
  />

  {#if isUnderline}
    <!-- Underline style: line at bottom of rect -->
    <line
      x1={1}
      y1={height - 1}
      x2={width - 1}
      y2={height - 1}
      stroke={strokeColor}
      stroke-width={strokeWidth}
      stroke-dasharray={dashArray}
      style:pointer-events="none"
    />
  {:else}
    <!-- Solid/Dashed style: rectangle border -->
    <rect
      x={strokeWidth / 2}
      y={strokeWidth / 2}
      width={Math.max(width - strokeWidth, 0)}
      height={Math.max(height - strokeWidth, 0)}
      fill="transparent"
      stroke={strokeColor}
      stroke-width={strokeWidth}
      stroke-dasharray={dashArray}
      style:pointer-events="none"
    />
  {/if}
</svg>
