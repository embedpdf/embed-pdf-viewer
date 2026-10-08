<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';
  import { config } from './viewer-config';
</script>

<PDFViewer src="/report.pdf" {...config} style="height: 100vh" />
