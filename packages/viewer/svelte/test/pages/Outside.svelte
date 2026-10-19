<!-- A component outside the viewer, which calls `usePDFViewer()` and keeps what it threw. -->
<script lang="ts">
  import { usePDFViewer } from '@embedpdf/viewer-svelte';
  import type { ViewerCodeRecord } from './viewer-code';

  let { record }: { record: ViewerCodeRecord } = $props();

  /** What `usePDFViewer()` does here: it's called while the component is created. */
  const outcome = (() => {
    try {
      usePDFViewer();
      return 'no error';
    } catch (error) {
      return (error as Error).message;
    }
  })();
  $effect.pre(() => {
    record.outside = outcome;
  });
</script>
