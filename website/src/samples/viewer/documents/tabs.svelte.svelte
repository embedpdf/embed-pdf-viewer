<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  const welcome = '/pdfs/welcome.pdf';
  const article = '/pdfs/article.pdf';
  const report = '/pdfs/report.pdf';

  const config: ViewerConfig = {
    documents: [
      { src: welcome, name: 'Welcome' },
      { src: article, name: 'Engineering blog' },
      { src: report, name: 'Q3 report', active: true },
    ],
  };
</script>

<PDFViewer {...config} style="height: 100%" />
