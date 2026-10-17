<!--
  A component inside the viewer: `usePDFViewer()`, three commands through `useCommand()`, and the
  Stage's state through the headless `useStageState()`, written to the page's record whenever they
  change.
-->
<script lang="ts" module>
  let mounts = 0;
</script>

<script lang="ts">
  import { useStageState } from '@embedpdf/svelte/stage';
  import { useCommand, usePDFViewer } from '@embedpdf/viewer-svelte';
  import type { ViewerCodeRecord } from './viewer-code';

  let { record }: { record: ViewerCodeRecord } = $props();

  const viewer = usePDFViewer();
  const zoomIn = useCommand('zoom:in');
  const pan = useCommand('tool:pan');
  const missing = useCommand('acme:missing');
  const stage = useStageState();
  const mount = ++mounts;

  $effect(() => {
    record.inside = {
      viewer,
      zoomLevel: stage.zoomLevel,
      zoomIn: { label: zoomIn.current.label, enabled: zoomIn.current.enabled },
      pan: { active: pan.current.active, run: pan.current.run },
      missing: { label: missing.current.label, enabled: missing.current.enabled },
      mounts: mount,
    };
  });
</script>
