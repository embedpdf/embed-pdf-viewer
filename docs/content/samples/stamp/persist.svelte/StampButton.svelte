<!-- One stamp, shown by its preview: a click arms it, a second click disarms it. -->
<script lang="ts">
  import { useStamp, useStampAssetPreviewUrl, type StampAsset } from '@embedpdf/svelte/stamp';

  let { asset, armed }: { asset: StampAsset; armed: boolean } = $props();

  const stamp = useStamp();
  const url = useStampAssetPreviewUrl(() => asset.id);

  function toggle() {
    if (armed) stamp.disarm();
    else void stamp.armAsset(asset.id);
  }
</script>

<button
  type="button"
  class="button"
  title="Place “{asset.label}”"
  aria-pressed={armed}
  onclick={toggle}
>
  {#if url.current}
    <img src={url.current} alt={asset.label} class="preview" />
  {:else}
    {asset.label}
  {/if}
</button>
