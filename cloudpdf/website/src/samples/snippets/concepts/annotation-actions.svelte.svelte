<script lang="ts">
  import { useAnnotation, type AnnotationRef } from '@embedpdf/svelte/annotation';
  import DrawingTools from './DrawingTools.svelte';

  let { annotationRef }: { annotationRef: AnnotationRef } = $props();

  const annotation = useAnnotation();
</script>

{#if annotation.canCreate()}
  <DrawingTools />
{/if}
<button disabled={!annotation.canDelete(annotationRef)}>Delete</button>
