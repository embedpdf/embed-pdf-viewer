<script lang="ts">
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useStamp, useStampAssets, useStampState } from '@embedpdf/svelte/stamp';
  import MyStamp from './MyStamp.svelte';

  const MY_STAMPS = 'my-stamps';

  const stamp = useStamp();
  const selected = useAnnotationState((state) => state.selected);
  const mine = useStampAssets({ libraryId: MY_STAMPS });
  const armedAsset = useStampState((state) => state.armedAsset);

  // A stamp is one page of artwork: the selection must be on one page.
  const page = $derived(selected.current[0]?.page);
  const canMake = $derived.by(() => {
    const onePage = selected.current.every(
      (annotation) => annotation.page.objectNumber === page?.objectNumber,
    );
    return !!page && onePage && stamp.canCreateFromAnnotations();
  });

  async function make() {
    if (!page) return;
    // The library is made on first use.
    if (!stamp.getLibrary(MY_STAMPS)) await stamp.createLibrary('My stamps', { id: MY_STAMPS });
    const { asset } = await stamp.createAssetFromAnnotations(
      page,
      selected.current.map((annotation) => annotation.ref),
      { libraryId: MY_STAMPS, label: `My stamp ${mine.current.length + 1}` },
    );
    await stamp.armAsset(asset.id);
  }
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={!canMake} onclick={() => void make()}>
    Make a stamp of the selection
  </button>
  {#each mine.current as asset (asset.id)}
    <MyStamp {asset} armed={armedAsset.current?.id === asset.id} />
  {/each}
  <span class="spacer"></span>
  <output class="readout">
    {armedAsset.current ? 'Click a page to place it' : `${selected.current.length} selected`}
  </output>
</div>
