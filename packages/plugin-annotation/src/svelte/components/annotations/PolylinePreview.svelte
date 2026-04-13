<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { PolylinePreviewData } from '@embedpdf/plugin-annotation';
  import Polyline from './Polyline.svelte';

  interface PolylinePreviewProps {
    data: PolylinePreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, scale }: PolylinePreviewProps = $props();
</script>

<Polyline isSelected={false} {scale} {...data} />
