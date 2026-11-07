<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  // [!doc-source welcome]
  const welcome = 'https://www.embedpdf.com/pdfs/welcome.pdf';
  // [!/doc-source]
  // [!doc-source article]
  const article = 'https://www.embedpdf.com/pdfs/article.pdf';
  // [!/doc-source]
  // [!doc-source report]
  const report = 'https://www.embedpdf.com/pdfs/report.pdf';
  // [!/doc-source]

  const config: ViewerConfig = {
    documents: [
      { src: welcome, name: 'Welcome' },
      { src: article, name: 'Engineering blog' },
      { src: report, name: 'Q3 report', active: true },
    ],
  };
</script>

<PDFViewer {...config} style="height: 100%" />
