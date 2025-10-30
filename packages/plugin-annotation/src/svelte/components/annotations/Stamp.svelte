<script lang="ts">
  import type { PdfStampAnnoObject } from '@embedpdf/models';
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import RenderAnnotation from '../RenderAnnotation.svelte';

  interface StampProps {
    isSelected: boolean;
    annotation: TrackedAnnotation<PdfStampAnnoObject>;
    pageIndex: number;
    scale: number;
    onClick: (e: MouseEvent | TouchEvent) => void;
  }

  let { isSelected, annotation, pageIndex, scale, onClick }: StampProps = $props();

  let annotationProp = $derived({...annotation.object, id: annotation.object.id});
</script>

<div
  style="position: absolute; width: 100%; height: 100%; z-index: 2;"
  style:pointer-events={isSelected ? 'none' : 'auto'}
  style:cursor="pointer"
  onpointerdown={onClick}
  ontouchstart={onClick}
>
  <RenderAnnotation
    {pageIndex}
    annotation={annotationProp}
    scaleFactor={scale}
  />
</div>
