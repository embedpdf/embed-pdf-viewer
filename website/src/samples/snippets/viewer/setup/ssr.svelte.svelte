<!-- src/routes/report/+page.svelte in SvelteKit: no {#if browser} needed. -->
<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';
</script>

<PDFViewer src="/report.pdf" style="height: 100vh" />
