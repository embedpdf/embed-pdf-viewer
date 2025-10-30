<script lang="ts">
  import Annotations from './Annotations.svelte';
  import TextMarkup from './TextMarkup.svelte';
  import AnnotationPaintLayer from './AnnotationPaintLayer.svelte';
  import { type PdfAnnotationObject } from '@embedpdf/models';
  import type { HTMLAttributes } from 'svelte/elements';
  import type {
    CustomAnnotationRenderer,
    ResizeHandleUI,
    SelectionMenu,
    VertexHandleUI,
  } from '../types';

  type AnnotationLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    pageIndex: number;
    scale: number;
    pageWidth: number;
    pageHeight: number;
    rotation: number;
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
    pageIndex,
    scale,
    selectionMenu,
    resizeUI,
    vertexUI,
    pageWidth,
    pageHeight,
    rotation,
    selectionOutlineColor,
    customAnnotationRenderer,
    ...restProps
  }: AnnotationLayerProps = $props();
</script>

<div
  {...style ? Object.fromEntries(Object.entries(style).map(([k, v]) => [`style:${k}`, v])) : {}}
  {...restProps}
>
  <Annotations
    {selectionMenu}
    {pageIndex}
    {scale}
    {rotation}
    {pageWidth}
    {pageHeight}
    {resizeUI}
    {vertexUI}
    {selectionOutlineColor}
    {customAnnotationRenderer}
  />
  <TextMarkup {pageIndex} {scale} />
  <AnnotationPaintLayer {pageIndex} {scale} />
</div>
