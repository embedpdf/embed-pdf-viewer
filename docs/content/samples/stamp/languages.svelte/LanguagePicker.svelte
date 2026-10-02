<script lang="ts">
  import { untrack } from 'svelte';
  import {
    useStamp,
    useStampAssets,
    useStampLibraries,
    useStampState,
  } from '@embedpdf/svelte/stamp';
  import { LOCALES, loadDefaultLibrary } from '@embedpdf/default-stamps/library';
  import StampButton from './StampButton.svelte';

  const stamp = useStamp();
  const libraries = useStampLibraries();
  const library = $derived(libraries.current[0]);
  const assets = useStampAssets(() => ({ libraryId: library?.id }));
  const armedAsset = useStampState((state) => state.armedAsset);
  let locale = $state('nl');

  // The library of the chosen language replaces the one before: the same
  // identifiers, translated labels. Dutch on load.
  $effect(() => {
    const chosen = locale;
    let current = true;
    untrack(() => {
      void loadDefaultLibrary(chosen).then(async (bytes) => {
        if (!current) return;
        for (const old of stamp.listLibraries()) await stamp.deleteLibrary(old.id);
        if (current) await stamp.importLibrary(bytes);
      });
    });
    return () => {
      current = false;
    };
  });
</script>

<div class="toolbar">
  <select class="field" aria-label="Language" bind:value={locale}>
    {#each LOCALES as code (code)}
      <option value={code}>{code}</option>
    {/each}
  </select>
  {#each assets.current.slice(0, 4) as asset (asset.id)}
    <StampButton {asset} armed={armedAsset.current?.id === asset.id} />
  {/each}
  <span class="spacer"></span>
  <output class="readout">{library?.name ?? 'Loading…'}</output>
</div>
