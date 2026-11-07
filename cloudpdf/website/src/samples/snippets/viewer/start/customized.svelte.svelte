<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';
  import { config } from './viewer-config';
</script>

<PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} {...config} style="height: 100vh" />
