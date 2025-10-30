<script lang="ts">
    import { PdfAnnotationBorderStyle, type Rect } from '@embedpdf/models';

    interface CircleProps{
        /** Whether the annotation is selected */
        isSelected: boolean;
        /** Fill colour – defaults to PDFium’s black if omitted */
        color?: string;
        /** Stroke colour – defaults to same as fill when omitted */
        strokeColor?: string;
        /** 0 – 1 */
        opacity?: number;
        /** Stroke width in PDF units */
        strokeWidth: number;
        /** Stroke type – defaults to solid when omitted */
        strokeStyle?: PdfAnnotationBorderStyle;
        /** Stroke dash array – defaults to undefined when omitted */
        strokeDashArray?: number[];
        /** Bounding box of the annotation */
        rect: Rect;
        /** Current page zoom factor */
        scale: number;
        /** Pointer/touch handler (used for selection) */
        onClick?: (e: PointerEvent | TouchEvent) => void;
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
        onClick
    }: CircleProps = $props();

    const { width, height, cx, cy, rx, ry } = $derived.by(() => {
        // Full bounding box *includes* stroke width.
        const outerW = rect.size.width;
        const outerH = rect.size.height;

        // Remove the stroke so the visible fill matches the preview.
        const innerW = Math.max(outerW - strokeWidth, 0);
        const innerH = Math.max(outerH - strokeWidth, 0);

        return {
            width: outerW,
            height: outerH,
            // Centre of the fill sits strokeWidth/2 in from the edges
            cx: strokeWidth / 2 + innerW / 2,
            cy: strokeWidth / 2 + innerH / 2,
            rx: innerW / 2,
            ry: innerH / 2,
        };
    });

    let svgWidth = $derived(width * scale);
    let svgHeight = $derived(height * scale);

    let peValue = $derived(isSelected ? 'none' : color === 'transparent' ? 'visibleStroke' : 'visible');
</script>

<svg
  style:position="absolute"
  style:width={`${svgWidth}px`}
  style:height={`${svgHeight}px`}
  style:pointer-events="none"
  style:z-index="2"
  {svgWidth}
  {svgHeight}
  viewBox={`0 0 ${width} ${height}`}
>
  <ellipse
    {cx}
    {cy}
    {rx}
    {ry}
    fill={color}
    {opacity}
    onpointerdown={(e) => onClick?.(e)}
    ontouchstart={(e) => onClick?.(e)}
    style:cursor={isSelected ? 'move' : 'pointer'}
    pointer-events={peValue}
    stroke={strokeColor ?? color}
    stroke-width={strokeWidth}
    stroke-dasharray={strokeStyle === PdfAnnotationBorderStyle.DASHED
      ? strokeDashArray?.join(',')
      : undefined}
  />
</svg>
