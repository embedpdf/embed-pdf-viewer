<!-- The selected text, read with readText() each time the selection settles. -->
<script lang="ts">
  import { useSelection, useSelectionState } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const selectionState = useSelectionState();
  const canCopy = $derived(selection.canCopy());
  let text = $state('');

  $effect(() => {
    // Read again for every new range, once the drag is over.
    void selectionState.range;
    if (selectionState.isSelecting || !canCopy) return;
    // A newer selection cancels a read that hasn't finished.
    const controller = new AbortController();
    selection.readText({ signal: controller.signal }).then(
      (value) => (text = value),
      () => {},
    );
    return () => controller.abort();
  });
</script>

<p class="preview">{text || 'Select some text to read it here.'}</p>
