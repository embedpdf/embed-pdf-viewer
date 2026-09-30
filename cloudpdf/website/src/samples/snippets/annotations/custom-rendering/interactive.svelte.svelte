<script lang="ts">
  import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/svelte/annotation';
  import ApprovalWidget from './ApprovalWidget.svelte';

  const renderers: AnnotationRenderer[] = [
    {
      for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
      component: ApprovalWidget,
      interactive: true,
    },
  ];
</script>

<AnnotationLayer {renderers} />
