<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  // [!doc-source report]
  const report = 'https://www.embedpdf.com/pdfs/report.pdf';
  // [!/doc-source]

  const config: ViewerConfig = {
    readOnly: true,
    features: { 'documents.download': false, 'documents.print': false },
  };
</script>

<PDFViewer src={report} {...config} style="height: 100%" />
