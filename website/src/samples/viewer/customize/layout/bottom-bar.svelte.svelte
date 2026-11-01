<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  const welcome = '/pdfs/welcome.pdf';

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
