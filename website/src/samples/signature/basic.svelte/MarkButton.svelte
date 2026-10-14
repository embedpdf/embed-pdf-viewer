<script lang="ts">
  import { useStampAssetPreviewUrl } from '@embedpdf/svelte/stamp';

  let { assetId, label, onPick }: { assetId: string; label: string; onPick: () => void } =
    $props();

  const url = useStampAssetPreviewUrl(() => assetId);
</script>

<button type="button" class="button" title={label} onclick={onPick}>
  {#if url.current}
    <img src={url.current} alt={label} class="preview" />
  {:else}
    {label}
  {/if}
</button>
