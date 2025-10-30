<script lang="ts">
    import { blendModeToCss, PdfAnnotationSubtype, PdfBlendMode, type Rect } from '@embedpdf/models';
    import type { AnnotationTool } from '@embedpdf/plugin-annotation';
    import { useSelectionCapability } from '@embedpdf/plugin-selection/svelte';

    import { useAnnotationCapability } from '../hooks';
    import Highlight from './text-markup/Highlight.svelte';
    import Squiggly from './text-markup/Squiggly.svelte';
    import Underline from './text-markup/Underline.svelte';
    import Strikeout from './text-markup/Strikeout.svelte';

    interface TextMarkupProps {
        pageIndex: number;
        scale: number;
    }

    let { pageIndex, scale }: TextMarkupProps = $props();

    const selectionCapability = useSelectionCapability();
    const annotationCapability = useAnnotationCapability();
    
    let rects = $state<Rect[]>([]);
    let boundingRect = $state<Rect | null>(null);
    let activeTool = $state<AnnotationTool | null>(null);

    // Subscribe to selection changes
    $effect(() => {
        if (!selectionCapability.provides) return;

        const off = selectionCapability.provides.onSelectionChange(() => {
            rects = selectionCapability.provides.getHighlightRectsForPage(pageIndex);
            boundingRect = selectionCapability.provides.getBoundingRectForPage(pageIndex);
        });
        return off;
    });

    // Subscribe to active tool changes
    $effect(() => {
        if (!annotationCapability.provides) return;

        const off = annotationCapability.provides.onActiveToolChange((tool) => {
            activeTool = tool;
        });
        return off;
    });

    const mixBlendMode = $derived(
        activeTool?.defaults?.blendMode
            ? blendModeToCss(activeTool.defaults.blendMode)
            : activeTool?.defaults?.type === PdfAnnotationSubtype.HIGHLIGHT
                ? blendModeToCss(PdfBlendMode.Multiply)
                : blendModeToCss(PdfBlendMode.Normal)
    );
</script>

{#if boundingRect && activeTool && activeTool.defaults}
    {#if activeTool.defaults.type === PdfAnnotationSubtype.UNDERLINE}
        <div
            style:mix-blend-mode={mixBlendMode}
            style:pointer-events="none"
            style:position="absolute"
            style:inset="0"
        >
            <Underline
                color={activeTool.defaults?.color}
                opacity={activeTool.defaults?.opacity}
                segmentRects={rects}
                {scale}
            />
        </div>
    {:else if activeTool.defaults.type === PdfAnnotationSubtype.HIGHLIGHT}
        <div
            style:mix-blend-mode={mixBlendMode}
            style:pointer-events="none"
            style:position="absolute"
            style:inset="0"
        >
            <Highlight
                color={activeTool.defaults?.color}
                opacity={activeTool.defaults?.opacity}
                segmentRects={rects}
                {scale}
            />
        </div>
    {:else if activeTool.defaults.type === PdfAnnotationSubtype.STRIKEOUT}
        <div
            style:mix-blend-mode={mixBlendMode}
            style:pointer-events="none"
            style:position="absolute"
            style:inset="0"
        >
            <Strikeout
                color={activeTool.defaults?.color}
                opacity={activeTool.defaults?.opacity}
                segmentRects={rects}
                {scale}
            />
        </div>
    {:else if activeTool.defaults.type === PdfAnnotationSubtype.SQUIGGLY}
        <div
            style:mix-blend-mode={mixBlendMode}
            style:pointer-events="none"
            style:position="absolute"
            style:inset="0"
        >
            <Squiggly
                color={activeTool.defaults?.color}
                opacity={activeTool.defaults?.opacity}
                segmentRects={rects}
                {scale}
            />
        </div>
    {/if}
{/if}
