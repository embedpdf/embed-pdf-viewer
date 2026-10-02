<script lang="ts">
  import { onMount } from 'svelte';
  import {
    useStamp,
    useStampAssets,
    useStampLibraries,
    useStampState,
  } from '@embedpdf/svelte/stamp';
  import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
  import StampButton from './StampButton.svelte';

  const stamp = useStamp();
  const libraries = useStampLibraries();
  const library = $derived(libraries.current[0]);
  const assets = useStampAssets(() => ({ libraryId: library?.id }));
  const armedAsset = useStampState((state) => state.armedAsset); // the stamp the next click places

  // On load: the standard stamps, English edition, with "Approved" armed.
  onMount(() => {
    void loadDefaultLibrary('en')
      .then((bytes) => stamp.importLibrary(bytes))
      .then(({ library: imported }) => {
        const approved = stamp
          .listAssets({ libraryId: imported.id })
          .find((asset) => asset.name === 'Approved');
        if (approved) return stamp.armAsset(approved.id);
      });
  });
</script>

{#if !library}
  <div class="toolbar">
    <output class="readout">Loading the stamps…</output>
  </div>
{:else}
  <div class="toolbar">
    {#each assets.current.slice(0, 6) as asset (asset.id)}
      <StampButton {asset} armed={armedAsset.current?.id === asset.id} />
    {/each}
    <span class="spacer"></span>
    <output class="readout">
      {armedAsset.current ? `Click a page to place “${armedAsset.current.label}”` : 'Pick a stamp'}
    </output>
  </div>
{/if}
