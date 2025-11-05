<!-- Line.svelte -->
<script lang="ts">
    import type { Rect, LinePoints, LineEndings } from '@embedpdf/models';
    import { PdfAnnotationBorderStyle } from '@embedpdf/models';
    import { patching } from '@embedpdf/plugin-annotation';

    interface LineProps {
        color?: string;                  // interior color
        opacity?: number;                // 0–1
        strokeWidth: number;             // PDF units
        strokeColor?: string;
        strokeStyle?: PdfAnnotationBorderStyle;
        strokeDashArray?: number[];
        rect: Rect;
        linePoints: LinePoints;
        lineEndings?: LineEndings;
        scale: number;
        onClick?: (e: MouseEvent | TouchEvent) => void;
        isSelected: boolean;
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
        isSelected
    }: LineProps = $props();

    // Localize endpoints into the annotation's bbox
    const x1 = $derived(linePoints.start.x - rect.origin.x);
    const y1 = $derived(linePoints.start.y - rect.origin.y);
    const x2 = $derived(linePoints.end.x - rect.origin.x);
    const y2 = $derived(linePoints.end.y - rect.origin.y);

    // Arrow-head / butt endings via shared factory
    const endings = $derived.by(() => {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        return {
            start: patching.createEnding(lineEndings?.start, strokeWidth, angle + Math.PI, x1, y1),
            end: patching.createEnding(lineEndings?.end, strokeWidth, angle, x2, y2)
        };
    });

    // Absolute placement + scaling
    const width = $derived(rect.size.width * scale);
    const height = $derived(rect.size.height * scale);

    // Dashed stroke only when requested
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
    <!-- Main line -->
    <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            opacity={opacity}
            onpointerdown={onClick}
            ontouchstart={onClick}
            style:cursor={isSelected ? 'move' : 'pointer'}
            style:pointer-events={isSelected ? 'none' : 'visibleStroke'}
            style:stroke={strokeColor}
            style:stroke-width={strokeWidth}
            style:stroke-linecap="butt"
            style:stroke-dasharray={dash}
    />

    <!-- Optional arrowheads / butt caps -->
    {#if endings.start}
        <path
                d={endings.start.d}
                transform={endings.start.transform}
                onpointerdown={onClick}
                ontouchstart={onClick}
                stroke={strokeColor}
                style:cursor={isSelected ? 'move' : 'pointer'}
                style:stroke-width={strokeWidth}
                style:stroke-linecap="butt"
                style:pointer-events={isSelected ? 'none' : (endings.start.filled ? 'visible' : 'visibleStroke')}
                style:stroke-dasharray={dash}
                fill={endings.start.filled ? color : 'none'}
        />
    {/if}

    {#if endings.end}
        <path
                d={endings.end.d}
                transform={endings.end.transform}
                stroke={strokeColor}
                onpointerdown={onClick}
                ontouchstart={onClick}
                style:cursor={isSelected ? 'move' : 'pointer'}
                style:stroke-width={strokeWidth}
                style:stroke-linecap="butt"
                style:pointer-events={isSelected ? 'none' : (endings.end.filled ? 'visible' : 'visibleStroke')}
                style:stroke-dasharray={dash}
                fill={endings.end.filled ? color : 'none'}
        />
    {/if}
</svg>