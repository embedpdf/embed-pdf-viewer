<!-- src/routes/report/+page.svelte in SvelteKit: no {#if browser} needed. -->
<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';
</script>

<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} style="height: 100vh" />
