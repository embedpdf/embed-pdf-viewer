<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';

  const token = 'fixture-token';
</script>

<PDFViewer src={{ token }} style="height: 100vh" />
