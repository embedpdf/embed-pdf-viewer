<script lang="ts">
    import type { Rect } from '@embedpdf/models';

    interface UnderlineProps {
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
    }: UnderlineProps = $props();

    const thickness = $derived(2 * scale); // 2 CSS px at 100% zoom
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
        <!-- Visual underline -->
        <div
            style:position="absolute"
            style:left="0"
            style:bottom="0"
            style:width="100%"
            style:height="{thickness}px"
            style:background={color}
            style:opacity={opacity}
            style:pointer-events="none"
        ></div>
    </div>
{/each}
