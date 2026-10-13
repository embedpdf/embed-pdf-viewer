<!-- A component in the viewer's toolbar: where it sits, the viewer, a command and a button. -->
<script lang="ts">
  import { Button, useCommand, usePDFViewer, useToolbarItem } from '@embedpdf/viewer-svelte';

  const item = useToolbarItem();
  const viewer = usePDFViewer();
  const fitWidth = useCommand('zoom:fit-width');
</script>

<span class={item.orientation}>{fitWidth.current.label}</span>
<Button command="zoom:in" />
<button type="button" onclick={() => viewer.get('stage').zoomOut()}>Zoom out</button>
