<script lang="ts">
  import { PDFViewer, type Layout } from '@embedpdf/viewer-svelte';

  let { simple }: { simple: boolean } = $props();

  const simpleLayout = (layout: Layout) =>
    layout.remove(['tool:pan', 'menu:view'], { from: 'main' });
</script>

<!-- A new key mounts a new viewer with the new config. -->
{#key simple}
  <PDFViewer src="/report.pdf" layout={simple ? simpleLayout : undefined} style="height: 100vh" />
{/key}
