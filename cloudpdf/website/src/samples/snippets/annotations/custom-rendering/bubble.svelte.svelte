<!-- CommentBubble.svelte -->
<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation, hovered }: AnnotationRendererProps = $props();
</script>

<!-- It fills its frame (`width` and `height` 100% in your CSS), so the selection
     outline and the click area match it, and it turns with the annotation. -->
<div class="bubble" class:bubble--hover={hovered}>
  {annotation.author?.[0] ?? '?'}
</div>
