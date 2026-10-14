<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';
  import { config } from './viewer-config';
</script>

<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} {...config} style="height: 100vh" />
