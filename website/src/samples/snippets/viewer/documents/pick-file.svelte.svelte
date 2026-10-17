<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';

  let files = $state<FileList>();
</script>

<input type="file" accept="application/pdf" bind:files />
<PDFViewer src={files?.[0] ?? null} style="height: 80vh" />
