<script lang="ts">
  import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/svelte/annotation';
  import CommentBubble from './CommentBubble.svelte';

  const renderers: AnnotationRenderer[] = [
    { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
  ];
</script>

<AnnotationLayer {renderers} />
