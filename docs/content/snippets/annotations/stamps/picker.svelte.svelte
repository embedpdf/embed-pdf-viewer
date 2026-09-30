<script lang="ts">
  import { useStamp, useStampAssets } from '@embedpdf/svelte/stamp';

  import StampPreview from './preview.svelte';

  let { libraryId }: { libraryId: string } = $props();

  const stamp = useStamp();
  const assets = useStampAssets(() => ({ libraryId }));
</script>

{#each assets.current as asset (asset.id)}
  <button onclick={() => stamp.armAsset(asset.id)}>
    <StampPreview assetId={asset.id} />
    {asset.label}
  </button>
{/each}
