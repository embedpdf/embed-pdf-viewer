<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-svelte';

  const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

  const config: ViewerConfig = {
    readOnly: true,
    disable: ['documents.download', 'documents.print'],
  };
</script>

<PDFViewer src={report} {...config} style="height: 100%" />
