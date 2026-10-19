<script lang="ts">
  import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/svelte/annotation';
  import ApprovalWidget from './ApprovalWidget.svelte';

  const renderers: AnnotationRenderer[] = [
    {
      for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
      component: ApprovalWidget,
      interactive: ({ toolId }) => toolId === 'pan', // interactive in reading mode only
    },
  ];
</script>

<AnnotationLayer {renderers} />
