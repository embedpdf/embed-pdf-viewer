<script lang="ts">
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { useStampCapability } from '../hooks';
  import type { HTMLImgAttributes } from 'svelte/elements';

  interface Props extends HTMLImgAttributes {
    libraryId: string;
    pageIndex: number;
    width: number;
    dpr?: number;
  }

  const { libraryId, pageIndex, width, dpr, ...imgProps }: Props = $props();

  const stampCapability = useStampCapability();

  let url = $state<string | undefined>(undefined);
  let urlRef: string | null = null;

  $effect(() => {
    if (!stampCapability.provides) return;

    const task = stampCapability.provides.renderStamp(
      libraryId,
      pageIndex,
      width,
      dpr ?? window.devicePixelRatio,
    );

    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef = objectUrl;
      url = objectUrl;
    }, ignore);

    return () => {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled stamp render task',
        });
      }
    };
  });

  const handleImageLoad = () => {
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
  };
</script>

{#if url}
  <img src={url} onload={handleImageLoad} {...imgProps} alt="Stamp preview" />
{/if}
