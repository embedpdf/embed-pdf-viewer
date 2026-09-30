<script lang="ts">
  import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/svelte/annotation';
  import ApprovedBadge from './ApprovedBadge.svelte';

  const renderers: AnnotationRenderer[] = [
    {
      for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
      component: ApprovedBadge,
    },
  ];
</script>

<AnnotationLayer {renderers} />
