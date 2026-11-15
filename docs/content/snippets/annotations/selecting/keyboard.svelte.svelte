<script lang="ts">
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { useInteraction } from '@embedpdf/svelte/interaction';

  const annotation = useAnnotation();
  const interaction = useInteraction();

  function onKey(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || annotation.text.getEditing()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') void annotation.selection.delete();
    const duplicate = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd';
    if (duplicate && annotation.selection.canDuplicate()) {
      event.preventDefault(); // the browser's bookmark key
      void annotation.selection.duplicate();
    }
    if (event.key === 'Escape') {
      annotation.cancel(); // a drag or a polygon in progress
      interaction.activateDefaultTool();
    }
  }
</script>

<svelte:window onkeydown={onKey} />
