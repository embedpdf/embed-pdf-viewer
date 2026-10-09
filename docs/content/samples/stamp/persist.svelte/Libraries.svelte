<script lang="ts" module>
  import { indexedDbByteStore } from '@embedpdf/svelte/stamp';

  // Where the libraries live between visits: this browser's IndexedDB.
  const store = indexedDbByteStore('embedpdf-stamp-example');
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { saveFile } from '@embedpdf/svelte/runtime';
  import {
    persistStampLibraries,
    restoreStampLibraries,
    useStamp,
    useStampAssets,
    useStampLibraries,
    useStampState,
  } from '@embedpdf/svelte/stamp';
  import StampButton from './StampButton.svelte';

  const stamp = useStamp();
  const libraries = useStampLibraries();
  const assets = useStampAssets();
  const armedAsset = useStampState((state) => state.armedAsset);
  let restored = $state<number | null>(null);

  onMount(() => {
    // Every change is written to the store from now on.
    const stopPersisting = persistStampLibraries(stamp, store);
    // On load: what the store kept. The first visit starts a library of its own.
    void restoreStampLibraries(stamp, store).then(async (ids) => {
      restored = ids.length;
      if (ids.length > 0) return;
      const { library } = await stamp.createLibrary('My stamps');
      await stamp.createAsset({
        libraryId: library.id,
        label: 'Checked',
        mark: { kind: 'text', text: 'Checked', fontFamily: 'times-bold-italic', color: '#1f7a3f' },
      });
    });
    return stopPersisting;
  });

  async function addStamp(libraryId: string) {
    const label = `Stamp ${assets.current.length + 1}`;
    await stamp.createAsset({
      libraryId,
      label,
      mark: { kind: 'text', text: label, fontFamily: 'helvetica-bold', color: '#054fb3' },
    });
  }

  function download(libraryId: string, name: string) {
    void stamp
      .exportLibrary(libraryId)
      .then((bytes) => saveFile(bytes, `${name}.pdf`, 'application/pdf'));
  }
</script>

<div class="toolbar">
  {#each assets.current as asset (asset.id)}
    <StampButton {asset} armed={armedAsset.current?.id === asset.id} />
  {/each}
  {#each libraries.current as library (library.id)}
    <span class="group">
      <button type="button" class="button" onclick={() => void addStamp(library.id)}>
        Add a stamp
      </button>
      <button
        type="button"
        class="button"
        title="The library as the PDF it is: open it in Acrobat, or import it again"
        onclick={() => download(library.id, library.name)}
      >
        Download “{library.name}”
      </button>
    </span>
  {/each}
  <span class="spacer"></span>
  <output class="readout">
    {restored === null ? 'Restoring…' : `${restored} restored: add a stamp, then reload the page`}
  </output>
</div>
