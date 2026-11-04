<!-- SnapshotActions.svelte: beside the pages, copy the snapshot or save it as a file -->
<script lang="ts">
  import { copyImage, saveFile } from '@embedpdf/svelte/runtime';
  import { useSnapshot, type Snapshot } from '@embedpdf/svelte/render';

  const snapshot = useSnapshot();

  async function save(shot: Snapshot) {
    saveFile(await (await shot.image).blob(), 'snapshot.png');
  }
</script>

{#if snapshot.current}
  {@const shot = snapshot.current}
  <div class="snapshot-actions">
    <!-- In the click itself, not after an await: the picture follows when it's there -->
    <button onclick={() => copyImage(shot.image)}>Copy</button>
    <button onclick={() => save(shot)}>Save</button>
  </div>
{/if}
