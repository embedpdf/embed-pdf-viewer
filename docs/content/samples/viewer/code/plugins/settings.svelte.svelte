<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  // [!doc-source links]
  const links = '/pdfs/links.pdf';
  // [!/doc-source]

  const config: ViewerConfig = {
    plugins: {
      stage: { spread: 'odd', zoom: { mode: 'fit-width' } },
      selection: { color: 'rgb(124 58 237 / 0.3)' },
    },
  };
</script>

<PDFViewer src={links} {...config} style="height: 100%" />
