<script lang="ts">
  import { Rotation, type PdfAnnotationObject } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type {
    CustomAnnotationRenderer,
    ResizeHandleUI,
    SelectionMenu,
    VertexHandleUI,
  } from '../types';
  import Annotations from './Annotations.svelte';
  import TextMarkup from './TextMarkup.svelte';
  import AnnotationPaintLayer from './AnnotationPaintLayer.svelte';

  type AnnotationLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    /** The ID of the document that this layer displays annotations for */
    documentId: string;
    pageIndex: number;
    scale?: number;
    rotation?: number;
    /** Customize selection menu across all annotations on this layer */
    selectionMenu?: SelectionMenu;
    style?: Record<string, string | number | undefined>;
    /** Customize resize handles */
    resizeUI?: ResizeHandleUI;
    /** Customize vertex handles */
    vertexUI?: VertexHandleUI;
    /** Customize selection outline color */
    selectionOutlineColor?: string;
    /** Customize annotation renderer */
    customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
  };

  let {
    style,
    documentId,
    pageIndex,
    scale: overrideScale,
    rotation: overrideRotation,
    selectionMenu,
    resizeUI,
    vertexUI,
    selectionOutlineColor,
    customAnnotationRenderer,
    ...restProps
  }: AnnotationLayerProps = $props();

  const documentState = useDocumentState(() => documentId);

  const page = $derived(documentState?.current?.document?.pages?.[pageIndex]);
  const pageWidth = $derived(page?.size?.width ?? 0);
  const pageHeight = $derived(page?.size?.height ?? 0);

  const actualScale = $derived(
    overrideScale !== undefined ? overrideScale : (documentState?.current?.scale ?? 1),
  );

  const actualRotation = $derived(
    overrideRotation !== undefined
      ? overrideRotation
      : (documentState?.current?.rotation ?? Rotation.Degree0),
  );
</script>

<div
  id="annotation-layer"
  {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
  {...restProps}
>
  <Annotations
    {documentId}
    {selectionMenu}
    {pageIndex}
    scale={actualScale}
    rotation={actualRotation}
    {pageWidth}
    {pageHeight}
    {resizeUI}
    {vertexUI}
    {selectionOutlineColor}
    {customAnnotationRenderer}
  />
  <TextMarkup {documentId} {pageIndex} scale={actualScale} />
  <AnnotationPaintLayer {documentId} {pageIndex} scale={actualScale} />
</div>
