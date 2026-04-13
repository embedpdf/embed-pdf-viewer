<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { SquarePreviewData } from '@embedpdf/plugin-annotation';
  import Square from './Square.svelte';

  interface SquarePreviewProps {
    data: SquarePreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, scale }: SquarePreviewProps = $props();
</script>

<Square isSelected={false} {scale} {...data} />
