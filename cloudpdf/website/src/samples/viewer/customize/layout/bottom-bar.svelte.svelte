<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-svelte';

  const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

  const config: ViewerConfig = {
    layout: (layout) =>
      layout
        .place('main', 'bottom')
        .remove('zoom', { from: 'main' })
        .addBar('zoom', {
          place: { float: 'bottom-end' },
          center: [[{ custom: 'zoom' }]],
        }),
  };
</script>

<PDFViewer src={welcome} {...config} style="height: 100%" />
