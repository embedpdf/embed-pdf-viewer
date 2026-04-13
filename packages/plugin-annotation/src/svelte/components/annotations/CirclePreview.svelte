<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { CirclePreviewData } from '@embedpdf/plugin-annotation';
  import Circle from './Circle.svelte';

  interface CirclePreviewProps {
    data: CirclePreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, scale }: CirclePreviewProps = $props();
</script>

<Circle isSelected={false} {scale} {...data} />
