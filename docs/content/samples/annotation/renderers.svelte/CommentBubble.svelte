<!--
  A note drawn as your app's comment bubble, the author's initials in it. It fills its frame, so
  the selection outline and the click area match it, and it turns with the annotation: a note
  stays upright on a turned page.
-->
<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation, hovered }: AnnotationRendererProps = $props();

  const initials = $derived(
    (annotation.author ?? '?')
      .split(' ')
      .map((word) => word[0])
      .join(''),
  );
</script>

<div class={['bubble', hovered && 'bubble--hover']}>{initials}</div>
