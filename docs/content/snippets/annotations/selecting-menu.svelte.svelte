<script lang="ts">
  import {
    AnnotationLayer,
    AnnotationMenu,
    useAnnotation,
    useAnnotationState,
  } from '@embedpdf/svelte/annotation';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';

  const annotation = useAnnotation();
  const state = useAnnotationState();
  const allText = $derived(state.selected.every((a) => a.subtype === 'free-text'));
</script>

<Stage>
  {#snippet page()}
    <RenderLayer annotations={false} />
    <AnnotationLayer />
  {/snippet}

  {#snippet overlay()}
    <AnnotationMenu placement="bottom">
      <div class="menu">
        {#if allText}
          <button onclick={() => annotation.text.toggleFormat('bold')}>Bold</button>
        {/if}
        <button onclick={() => annotation.selection.update({ color: '#dc143c' })}>Red</button>
        <button onclick={() => annotation.selection.delete()}>Delete</button>
      </div>
    </AnnotationMenu>
  {/snippet}
</Stage>
