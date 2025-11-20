<script lang="ts">
    import type { AnyPreviewState } from '@embedpdf/plugin-annotation';
    import { PdfAnnotationSubtype } from '@embedpdf/models';
    import Circle from './annotations/Circle.svelte';
    import Square from './annotations/Square.svelte';
    import Polygon from './annotations/Polygon.svelte';
    import Polyline from './annotations/Polyline.svelte';
    import Line from './annotations/Line.svelte';
    import Ink from './annotations/Ink.svelte';

    interface PreviewRendererProps {
        preview: AnyPreviewState;
        scale: number;
    }

    let { preview, scale }: PreviewRendererProps = $props();

    const bounds = $derived(preview.bounds);
    
    const style = $derived({
        left: bounds.origin.x * scale,
        top: bounds.origin.y * scale,
        width: bounds.size.width * scale,
        height: bounds.size.height * scale,
    });
</script>

{#if preview.type === PdfAnnotationSubtype.CIRCLE}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <Circle isSelected={false} {scale} {...preview.data} />
    </div>
{:else if preview.type === PdfAnnotationSubtype.SQUARE}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <Square isSelected={false} {scale} {...preview.data} />
    </div>
{:else if preview.type === PdfAnnotationSubtype.POLYGON}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <Polygon isSelected={false} {scale} {...preview.data} />
    </div>
{:else if preview.type === PdfAnnotationSubtype.POLYLINE}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <Polyline isSelected={false} {scale} {...preview.data} />
    </div>
{:else if preview.type === PdfAnnotationSubtype.LINE}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <Line isSelected={false} {scale} {...preview.data} />
    </div>
{:else if preview.type === PdfAnnotationSubtype.INK}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <Ink isSelected={false} {scale} {...preview.data} />
    </div>
{:else if preview.type === PdfAnnotationSubtype.FREETEXT}
    <div
        style:position="absolute"
        style:left="{style.left}px"
        style:top="{style.top}px"
        style:width="{style.width}px"
        style:height="{style.height}px"
        style:pointer-events="none"
        style:z-index="10"
    >
        <!-- Render a simple dashed border preview -->
        <div
            style:width="100%"
            style:height="100%"
            style:border="1px dashed {preview.data.fontColor || '#000000'}"
            style:background-color="transparent"
        ></div>
    </div>
{/if}
