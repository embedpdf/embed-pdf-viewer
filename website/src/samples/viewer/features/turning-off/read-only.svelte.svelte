<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  const report = '/pdfs/report.pdf';

  const config: ViewerConfig = {
    readOnly: true,
    disable: ['documents.download', 'documents.print'],
  };
</script>

<PDFViewer src={report} {...config} style="height: 100%" />
