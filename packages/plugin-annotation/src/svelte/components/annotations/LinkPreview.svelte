<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { LinkPreviewData } from '@embedpdf/plugin-annotation';

  interface LinkPreviewProps {
    data: LinkPreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, bounds, scale }: LinkPreviewProps = $props();
</script>

<div
  style:position="absolute"
  style:left="0"
  style:top="0"
  style:width="{bounds.size.width * scale}px"
  style:height="{bounds.size.height * scale}px"
  style:border-bottom="{data.strokeWidth * scale}px solid {data.strokeColor}"
  style:background-color="rgba(0, 0, 255, 0.05)"
  style:box-sizing="border-box"
></div>
