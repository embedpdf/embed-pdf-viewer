<!--
  <RenderLayer>: the page's picture. The render plugin draws it (RasterLayer), unless another
  plugin paints this view's pictures (`handOverPictures`): then the layer lends that plugin its
  box (PainterBox).
-->
<script lang="ts">
  import type { PicturePainter } from '@embedpdf/plugin-render';
  import { RenderToken } from '@embedpdf/plugin-render/contract/host';
  import { usePage } from '../runtime/page';
  import { useOptionalSelector } from '../runtime/readers.svelte';
  import PainterBox from './PainterBox.svelte';
  import type { RenderLayerProps } from './props';
  import RasterLayer from './RasterLayer.svelte';

  let { annotations, formFields, tiles = true, thumbnail = false }: RenderLayerProps = $props();

  const page = usePage();
  const painter = useOptionalSelector(
    RenderToken,
    (renderer) => renderer.getPicturePainter(),
    null,
  );
  /** The plugin that paints this view's pictures, or `null` while the render plugin does. */
  const painting = $derived(
    painter.current?.paints(page.view) ? (painter.current as PicturePainter<HTMLElement>) : null,
  );
</script>

{#if painting}
  <PainterBox painter={painting} />
{:else}
  <RasterLayer {annotations} {formFields} {tiles} {thumbnail} />
{/if}
