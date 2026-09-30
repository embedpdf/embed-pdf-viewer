<script lang="ts">
  import { useStampAssetPreviewUrl } from '@embedpdf/svelte/stamp';

  let { assetId }: { assetId: string } = $props();

  const url = useStampAssetPreviewUrl(() => assetId);
</script>

{#if url.current}
  <img src={url.current} alt="" />
{/if}
