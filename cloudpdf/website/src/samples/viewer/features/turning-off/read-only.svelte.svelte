<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-svelte';

  const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

  const config: ViewerConfig = {
    readOnly: true,
    features: { 'documents.download': false, 'documents.print': false },
  };
</script>

<PDFViewer src={report} {...config} style="height: 100%" />
