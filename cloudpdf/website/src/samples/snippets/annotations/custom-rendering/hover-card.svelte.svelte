<!-- StampCard.svelte, for the Stage's overlay snippet -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useAnnotationAnchor, useAnnotationState } from '@embedpdf/svelte/annotation';

  const state = useAnnotationState(); // state.hovered: the annotation under the pointer, or null
  const anchor = useAnnotationAnchor(() => state.hovered?.ref ?? null);
</script>

{#if state.hovered?.subtype === 'stamp'}
  <Anchored anchor={anchor.current} placement="top">
    <div class="card">Approved by {state.hovered.author}</div>
  </Anchored>
{/if}
