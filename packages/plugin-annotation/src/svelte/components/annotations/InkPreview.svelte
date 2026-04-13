<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { InkPreviewData } from '@embedpdf/plugin-annotation';
  import Ink from './Ink.svelte';

  interface InkPreviewProps {
    data: InkPreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, scale }: InkPreviewProps = $props();
</script>

<Ink isSelected={false} {scale} {...data} />
