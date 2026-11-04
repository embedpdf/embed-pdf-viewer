<script lang="ts">
  import { copyImage, saveFile } from '@embedpdf/svelte/runtime';
  import { useSnapshot } from '@embedpdf/svelte/render';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();
  const tools = useInteractionState();
  const snapshot = useSnapshot();
  let said = $state('');
  // A new snapshot, or none: nothing copied yet.
  $effect(() => {
    void snapshot.current;
    said = '';
  });

  function copy() {
    if (!snapshot.current) return;
    // In the click itself: the picture goes to the clipboard as it comes.
    copyImage(snapshot.current.image).then(
      () => (said = 'Copied: paste it anywhere'),
      () => (said = 'This browser didn’t allow the copy'),
    );
  }

  async function save() {
    if (!snapshot.current) return;
    saveFile(await (await snapshot.current.image).blob(), 'snapshot.png');
  }
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    <button
      type="button"
      class="segment"
      aria-pressed={tools.activeToolId === 'pan'}
      onclick={() => interaction.activateTool('pan')}
    >
      Hand
    </button>
    <button
      type="button"
      class="segment"
      aria-pressed={tools.activeToolId === 'snapshot'}
      onclick={() => interaction.activateTool('snapshot')}
    >
      Snapshot
    </button>
  </div>
  <div class="actions">
    <button type="button" class="button" disabled={!snapshot.current} onclick={copy}>Copy</button>
    <button type="button" class="button" disabled={!snapshot.current} onclick={save}>Save</button>
  </div>
  <output class="readout">
    {said || (tools.activeToolId === 'snapshot' && !snapshot.current ? 'Drag a box on a page' : '')}
  </output>
</div>
