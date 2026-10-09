<!-- A card next to the annotation under the pointer: who wrote it, and what. -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useAnnotationAnchor, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotations = useAnnotationState(); // annotations.hovered: the one under the pointer, or null
  const anchor = useAnnotationAnchor(() => annotations.hovered?.ref ?? null);
</script>

{#if annotations.hovered?.contents}
  <Anchored anchor={anchor.current} placement="top">
    <div class="card">
      <strong>{annotations.hovered.author ?? 'Someone'}</strong>
      <p>{annotations.hovered.contents}</p>
    </div>
  </Anchored>
{/if}
