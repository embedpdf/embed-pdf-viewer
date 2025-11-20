<!-- Polygon.svelte -->
<script lang="ts">
    import type { Rect, Position } from '@embedpdf/models';
    import { PdfAnnotationBorderStyle } from '@embedpdf/models';

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
        onClick?: (e: MouseEvent | TouchEvent) => void;
        // Preview-only
        currentVertex?: Position;
        handleSize?: number;
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
        handleSize = 14
    }: PolygonProps = $props();

    // Combine vertices with preview point (if any)
    const allPoints = $derived(currentVertex ? [...vertices, currentVertex] : vertices);

    // Localize points to the annotation bbox
    const localPts = $derived(
        allPoints.map(({ x, y }) => ({ x: x - rect.origin.x, y: y - rect.origin.y }))
    );

    // Build path data; omit 'Z' when previewing
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

    const dash = $derived(
        strokeStyle === PdfAnnotationBorderStyle.DASHED ? strokeDashArray?.join(',') : undefined
    );
</script>

<svg
        style="position: absolute; z-index: 2; overflow: visible; pointer-events: none;"
        style:width={`${width}px`}
        style:height={`${height}px`}
        width={width}
        height={height}
        viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
>
    <path
            d={pathData}
            onpointerdown={onClick}
            ontouchstart={onClick}
            opacity={opacity}
            style:fill={currentVertex ? 'none' : color}
            style:stroke={strokeColor ?? color}
            style:stroke-width={strokeWidth}
            style:cursor={isSelected ? 'move' : 'pointer'}
            style:pointer-events={isSelected ? 'none' : (color === 'transparent' ? 'visibleStroke' : 'visible')}
            style:stroke-linecap="butt"
            style:stroke-linejoin="miter"
            style:stroke-dasharray={dash}
    />

    <!-- Preview-only elements -->
    {#if isPreviewing && vertices.length > 1}
        <path
                d={`M ${localPts[localPts.length - 1].x} ${localPts[localPts.length - 1].y} L ${localPts[0].x} ${localPts[0].y}`}
                fill="none"
                style:stroke={strokeColor}
                style:stroke-width={strokeWidth}
                style:stroke-dasharray={'4,4'}
                style:opacity={0.7}
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
        />
    {/if}
</svg>