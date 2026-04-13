<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { LinePreviewData } from '@embedpdf/plugin-annotation';
  import Line from './Line.svelte';

  interface LinePreviewProps {
    data: LinePreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, scale }: LinePreviewProps = $props();
</script>

<Line isSelected={false} {scale} {...data} />
