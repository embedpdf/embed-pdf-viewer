<!-- What's in the menu depends on what's selected: text boxes get Bold and Edit. -->
<script lang="ts">
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const annotations = useAnnotationState();
  const allText = $derived(annotations.selected.every((a) => a.subtype === 'free-text'));
  const first = $derived(annotations.selected[0]);
</script>

<div class="menu" role="toolbar" aria-label="Selection">
  {#if allText}
    <button type="button" onclick={() => annotation.text.toggleFormat('bold')}>Bold</button>
  {/if}
  {#if allText && annotations.selected.length === 1 && first}
    <button type="button" onclick={() => annotation.text.begin(first.ref)}>Edit text</button>
  {/if}
  <button type="button" onclick={() => annotation.selection.update({ color: '#dc143c' })}>
    Red
  </button>
  <button type="button" onclick={() => annotation.selection.delete()}>Delete</button>
</div>
