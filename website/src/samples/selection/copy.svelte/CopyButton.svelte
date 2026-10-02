<script lang="ts">
  import { copySelection, useSelection, useSelectionState } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const hasSelection = useSelectionState((state) => state.hasSelection);
  let status = $state('');

  function copy() {
    copySelection(selection).then(
      (text) => (status = `Copied ${text.length} characters`),
      // The browser can refuse the clipboard, for example in a frame that doesn't allow it.
      () => (status = "The browser didn't allow copying"),
    );
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!hasSelection.current || !selection.canCopy()}
    onclick={copy}
  >
    Copy
  </button>
  <output class="readout">{status || 'Or press Ctrl+C'}</output>
</div>
