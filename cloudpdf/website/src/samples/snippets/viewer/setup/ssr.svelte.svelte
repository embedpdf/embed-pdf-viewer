<!-- src/routes/report/+page.svelte in SvelteKit: no {#if browser} needed. -->
<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';
</script>

<PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} style="height: 100vh" />
