<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { FreeTextPreviewData } from '@embedpdf/plugin-annotation';

  interface FreeTextPreviewProps {
    data: FreeTextPreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data }: FreeTextPreviewProps = $props();
</script>

<div
  style:width="100%"
  style:height="100%"
  style:border="1px dashed {data.fontColor || '#000000'}"
  style:background-color="transparent"
></div>
