<script lang="ts">
  import { type Rotation, type PdfAnnotationObject } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type {
    AnnotationSelectionMenuProps,
    AnnotationSelectionMenuRenderFn,
    GroupSelectionMenuProps,
    GroupSelectionMenuRenderFn,
    CustomAnnotationRenderer,
    ResizeHandleUI,
    VertexHandleUI,
  } from '../types';
  import { getRendererRegistry, type BoxedAnnotationRenderer } from '../context';
  import Annotations from './Annotations.svelte';
  import TextMarkup from './TextMarkup.svelte';
  import AnnotationPaintLayer from './AnnotationPaintLayer.svelte';
  import type { Snippet } from 'svelte';

  type AnnotationLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    /** The ID of the document that this layer displays annotations for */
    documentId: string;
    pageIndex: number;
    scale?: number;
    rotation?: number;
    /** Render function for selection menu (schema-driven approach) */
    selectionMenu?: AnnotationSelectionMenuRenderFn;
    /** Snippet for custom selection menu (slot-based approach) */
    selectionMenuSnippet?: Snippet<[AnnotationSelectionMenuProps]>;
    /** Render function for group selection menu (schema-driven approach) */
    groupSelectionMenu?: GroupSelectionMenuRenderFn;
    /** Snippet for custom group selection menu (slot-based approach) */
    groupSelectionMenuSnippet?: Snippet<[GroupSelectionMenuProps]>;
    style?: Record<string, string | number | undefined>;
    /** Customize resize handles */
    resizeUI?: ResizeHandleUI;
    /** Customize vertex handles */
    vertexUI?: VertexHandleUI;
    /** Customize selection outline color */
    selectionOutlineColor?: string;
    /** Customize annotation renderer */
    customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
    /** Custom annotation renderers from props */
    annotationRenderers?: BoxedAnnotationRenderer[];
  };

  let {
    style,
    documentId,
    pageIndex,
    scale: overrideScale,
    rotation: overrideRotation,
    selectionMenu,
    selectionMenuSnippet,
    groupSelectionMenu,
    groupSelectionMenuSnippet,
    resizeUI,
    vertexUI,
    selectionOutlineColor,
    customAnnotationRenderer,
    annotationRenderers,
    ...restProps
  }: AnnotationLayerProps = $props();

  // Get registry and merge with props
  const registry = getRendererRegistry();

  const allRenderers = $derived.by(() => {
    const fromRegistry = registry?.getAll() ?? [];
    const fromProps = annotationRenderers ?? [];
    const merged = [...fromRegistry];
    for (const r of fromProps) {
      const idx = merged.findIndex((m) => m.id === r.id);
      if (idx >= 0) merged[idx] = r;
      else merged.push(r);
    }
    return merged;
  });

  const documentState = useDocumentState(() => documentId);

  const page = $derived(documentState?.current?.document?.pages?.[pageIndex]);
  const pageWidth = $derived(page?.size?.width ?? 0);
  const pageHeight = $derived(page?.size?.height ?? 0);

  const actualScale = $derived(
    overrideScale !== undefined ? overrideScale : (documentState?.current?.scale ?? 1),
  );

  const actualRotation = $derived.by(() => {
    if (overrideRotation !== undefined) return overrideRotation;
    // Combine page intrinsic rotation with document rotation
    const pageRotation = page?.rotation ?? 0;
    const docRotation = documentState?.current?.rotation ?? 0;
    return ((pageRotation + docRotation) % 4) as Rotation;
  });
</script>

<div
  id="annotation-layer"
  {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
  {...restProps}
>
  <Annotations
    {documentId}
    {selectionMenu}
    {selectionMenuSnippet}
    {groupSelectionMenu}
    {groupSelectionMenuSnippet}
    {pageIndex}
    scale={actualScale}
    rotation={actualRotation}
    {pageWidth}
    {pageHeight}
    {resizeUI}
    {vertexUI}
    {selectionOutlineColor}
    {customAnnotationRenderer}
    annotationRenderers={allRenderers}
  />
  <TextMarkup {documentId} {pageIndex} scale={actualScale} />
  <AnnotationPaintLayer {documentId} {pageIndex} scale={actualScale} />
</div>
