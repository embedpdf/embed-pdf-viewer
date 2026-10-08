<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';

  let { readOnly }: { readOnly: boolean } = $props();
</script>

<!-- A new key mounts a new viewer with the new config. -->
{#key readOnly}
  <PDFViewer
    src="/report.pdf"
    disable={readOnly ? ['annotations', 'forms'] : []}
    style="height: 100vh"
  />
{/key}
