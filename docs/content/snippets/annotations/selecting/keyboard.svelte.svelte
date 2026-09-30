<script lang="ts">
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { useInteraction } from '@embedpdf/svelte/interaction';

  const annotation = useAnnotation();
  const interaction = useInteraction();

  function onKey(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || annotation.text.getEditing()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') void annotation.selection.delete();
    if (event.key === 'Escape') {
      annotation.cancel(); // a drag or a polygon in progress
      interaction.activateDefaultTool();
    }
  }
</script>

<svelte:window onkeydown={onKey} />
