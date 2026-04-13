<script lang="ts">
  import type { Rect } from '@embedpdf/models';

  let { bounds, scale }: { data: unknown; bounds: Rect; scale: number } = $props();
</script>

<div
  style:position="absolute"
  style:left="0"
  style:top="0"
  style:width="{bounds.size.width * scale}px"
  style:height="{bounds.size.height * scale}px"
  style:border="1px dashed rgba(66, 133, 244, 0.6)"
  style:background-color="rgba(255, 255, 255, 0.9)"
  style:border-radius="50%"
  style:box-sizing="border-box"
  style:display="flex"
  style:align-items="center"
  style:justify-content="center"
></div>
