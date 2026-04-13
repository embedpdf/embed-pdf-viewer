<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { StampPreviewData } from '@embedpdf/plugin-annotation';

  interface StampPreviewProps {
    data: StampPreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data }: StampPreviewProps = $props();

  const rotationDeg = $derived(((4 - data.pageRotation) % 4) * 90);
</script>

<img
  src={data.ghostUrl}
  style:width="100%"
  style:height="100%"
  style:opacity="0.6"
  style:object-fit="contain"
  style:pointer-events="none"
  style:transform={rotationDeg ? `rotate(${rotationDeg}deg)` : undefined}
  alt=""
/>
