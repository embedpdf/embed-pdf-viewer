<script lang="ts">
    import type { Rect } from '@embedpdf/models';

    interface HighlightProps {
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
    }: HighlightProps = $props();
</script>

{#each segmentRects as b, i (i)}
    <div
        role="button"
        tabindex={onClick ? 0 : -1}
        onpointerdown={onClick}
        ontouchstart={onClick}
        style:position="absolute"
        style:left="{(rect ? b.origin.x - rect.origin.x : b.origin.x) * scale}px"
        style:top="{(rect ? b.origin.y - rect.origin.y : b.origin.y) * scale}px"
        style:width="{b.size.width * scale}px"
        style:height="{b.size.height * scale}px"
        style:background={color}
        style:opacity={opacity}
        style:pointer-events={onClick ? 'auto' : 'none'}
        style:cursor={onClick ? 'pointer' : 'default'}
        style:z-index={onClick ? 1 : undefined}
        {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
    ></div>
{/each}
