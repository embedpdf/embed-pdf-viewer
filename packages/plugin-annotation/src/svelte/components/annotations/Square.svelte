<!-- Square.svelte -->
<script lang="ts">
    import type { Rect } from '@embedpdf/models';
    import { PdfAnnotationBorderStyle } from '@embedpdf/models';

    interface SquareProps {
        isSelected: boolean;
        color?: string;            // fill color (defaults to black)
        strokeColor?: string;      // stroke color (defaults to fill when omitted)
        opacity?: number;          // 0–1
        strokeWidth: number;       // PDF units
        strokeStyle?: PdfAnnotationBorderStyle;
        strokeDashArray?: number[];
        rect: Rect;                // bbox includes stroke
        scale: number;             // page zoom
        onClick?: (e: MouseEvent | TouchEvent) => void;
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
    }: SquareProps = $props();

    // Geometry helpers — compute inner rect so visual fill matches preview
    const {width, height, x, y} = $derived.by(() => {
        const outerW = rect.size.width;
        const outerH = rect.size.height;
        const innerW = Math.max(outerW - strokeWidth, 0);
        const innerH = Math.max(outerH - strokeWidth, 0);
        return {
            width: innerW,
            height: innerH,
            x: strokeWidth / 2,
            y: strokeWidth / 2
        };
    });

    const svgWidth = $derived((width + strokeWidth) * scale);
    const svgHeight = $derived((height + strokeWidth) * scale);

    const dash = $derived(
        strokeStyle === PdfAnnotationBorderStyle.DASHED ? strokeDashArray?.join(',') : undefined
    );
</script>

<svg
        style="position: absolute; pointer-events: none; z-index: 2;"
        style:width={`${svgWidth}px`}
        style:height={`${svgHeight}px`}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${width + strokeWidth} ${height + strokeWidth}`}
>
    <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={color}
            opacity={opacity}
            onpointerdown={onClick}
            ontouchstart={onClick}
            style:cursor={isSelected ? 'move' : 'pointer'}
            style:pointer-events={isSelected ? 'none' : (color === 'transparent' ? 'visibleStroke' : 'visible')}
            style:stroke={strokeColor ?? color}
            style:stroke-width={strokeWidth}
            style:stroke-dasharray={dash}
    />
</svg>