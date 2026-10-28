<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';
  import { config } from './viewer-config';
</script>

<PDFViewer src={{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} {...config} style="height: 100vh" />
