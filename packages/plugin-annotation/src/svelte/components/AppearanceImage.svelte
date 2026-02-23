<script lang="ts">
  import { type AnnotationAppearanceImage } from '@embedpdf/models';

  interface Props {
    appearance: AnnotationAppearanceImage<Blob>;
    style?: string;
  }

  let { appearance, style }: Props = $props();

  let imageUrl = $state<string | null>(null);
  let currentUrl: string | null = null;

  $effect(() => {
    const url = URL.createObjectURL(appearance.data);
    imageUrl = url;
    currentUrl = url;

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
    };
  });

  function handleLoad() {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  }
</script>

{#if imageUrl}
  <img
    src={imageUrl}
    alt=""
    draggable="false"
    onload={handleLoad}
    style="position: absolute; width: 100%; height: 100%; display: block; pointer-events: none; user-select: none; {style ??
      ''}"
  />
{/if}
