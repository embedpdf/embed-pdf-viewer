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
    documentId: string;
    pageIndex: number;
    scale: number;
  }

  let { documentId, pageIndex, scale }: TextMarkupProps = $props();

  const selectionCapability = useSelectionCapability();
  const annotationCapability = useAnnotationCapability();

  let rects = $state<Rect[]>([]);
  let boundingRect = $state<Rect | null>(null);
  let activeTool = $state<AnnotationTool | null>(null);

  // Get scoped APIs for this document
  const selectionProvides = $derived(
    selectionCapability.provides ? selectionCapability.provides.forDocument(documentId) : null,
  );
  const annotationProvides = $derived(
    annotationCapability.provides ? annotationCapability.provides.forDocument(documentId) : null,
  );

  // Subscribe to selection changes
  $effect(() => {
    if (!selectionProvides) return;

    const off = selectionProvides.onSelectionChange(() => {
      rects = selectionProvides.getHighlightRectsForPage(pageIndex);
      boundingRect = selectionProvides.getBoundingRectForPage(pageIndex);
    });
    return off;
  });

  // Subscribe to active tool changes
  $effect(() => {
    if (!annotationProvides) return;

    // Initialize with current active tool
    activeTool = annotationProvides.getActiveTool();

    const off = annotationProvides.onActiveToolChange((tool) => {
      activeTool = tool;
    });
    return off;
  });

  const mixBlendMode = $derived(
    activeTool?.defaults?.blendMode
      ? blendModeToCss(activeTool.defaults.blendMode)
      : activeTool?.defaults?.type === PdfAnnotationSubtype.HIGHLIGHT
        ? blendModeToCss(PdfBlendMode.Multiply)
        : blendModeToCss(PdfBlendMode.Normal),
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
