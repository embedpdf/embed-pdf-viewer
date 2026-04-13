<script lang="ts">
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { useFormCapability } from '../hooks/use-form.svelte';
  import { deepToRaw } from '@embedpdf/utils/svelte';

  interface RenderWidgetProps {
    pageIndex: number;
    annotation: PdfWidgetAnnoObject;
    scaleFactor?: number;
    renderKey?: number;
    style?: string;
  }

  let {
    pageIndex,
    annotation,
    scaleFactor = 1,
    renderKey = 0,
    style = '',
  }: RenderWidgetProps = $props();

  const formCapability = useFormCapability();
  let imageUrl = $state<string | null>(null);
  let prevUrl: string | null = null;

  $effect(() => {
    if (!formCapability.provides) return;

    const { width, height } = annotation.rect.size;
    const id = annotation.id;
    const sf = scaleFactor;
    const rk = renderKey;
    const pi = pageIndex;

    const task = formCapability.provides.renderWidget({
      pageIndex: pi,
      annotation: deepToRaw(annotation),
      options: {
        scaleFactor: sf,
        dpr: window.devicePixelRatio,
      },
    });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      prevUrl = url;
      imageUrl = url;
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
        prevUrl = null;
      }
    };
  });
</script>

{#if imageUrl}
  <img src={imageUrl} alt="" style="width: 100%; height: 100%; display: block; {style}" />
{/if}
