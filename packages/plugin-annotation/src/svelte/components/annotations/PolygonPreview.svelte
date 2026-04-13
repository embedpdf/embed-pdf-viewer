<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { PolygonPreviewData } from '@embedpdf/plugin-annotation';
  import Polygon from './Polygon.svelte';

  interface PolygonPreviewProps {
    data: PolygonPreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, scale }: PolygonPreviewProps = $props();
</script>

<Polygon isSelected={false} {scale} {...data} />
