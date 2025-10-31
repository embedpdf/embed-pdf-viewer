<script lang="ts">
    import type { Rect } from '@embedpdf/models';

    interface SquigglyProps {
        color?: string;
        opacity?: number;
        segmentRects: Rect[];
        rect?: Rect;
        scale: number;
        onClick?: (e: MouseEvent | TouchEvent) => void;
        style?: Record<string, string | number | undefined>;
    }

    let {
        color = '#FFFF00',
        opacity = 0.5,
        segmentRects,
        rect,
        scale,
        onClick,
        style
    }: SquigglyProps = $props();

    const amplitude = $derived(2 * scale); // wave height
    const period = $derived(6 * scale); // wave length

    const svg = $derived(`<svg xmlns="http://www.w3.org/2000/svg" width="${period}" height="${amplitude * 2}" viewBox="0 0 ${period} ${amplitude * 2}">
      <path d="M0 ${amplitude} Q ${period / 4} 0 ${period / 2} ${amplitude} T ${period} ${amplitude}"
            fill="none" stroke="${color}" stroke-width="${amplitude}" stroke-linecap="round"/>
    </svg>`);

    // Completely escape the SVG markup
    const svgDataUri = $derived(`url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`);
</script>

{#each segmentRects as r, i (i)}
    <div
        role="button"
        tabindex={onClick ? 0 : -1}
        onpointerdown={onClick}
        ontouchstart={onClick}
        style:position="absolute"
        style:left="{(rect ? r.origin.x - rect.origin.x : r.origin.x) * scale}px"
        style:top="{(rect ? r.origin.y - rect.origin.y : r.origin.y) * scale}px"
        style:width="{r.size.width * scale}px"
        style:height="{r.size.height * scale}px"
        style:background="transparent"
        style:pointer-events={onClick ? 'auto' : 'none'}
        style:cursor={onClick ? 'pointer' : 'default'}
        style:z-index={onClick ? 1 : 0}
        {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
    >
        <!-- Visual squiggly line -->
        <div
            style:position="absolute"
            style:left="0"
            style:bottom="0"
            style:width="100%"
            style:height="{amplitude * 2}px"
            style:background-image={svgDataUri}
            style:background-repeat="repeat-x"
            style:background-size="{period}px {amplitude * 2}px"
            style:opacity={opacity}
            style:pointer-events="none"
        ></div>
    </div>
{/each}
