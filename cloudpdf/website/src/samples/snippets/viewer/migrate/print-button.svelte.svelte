<!-- 2.x:

<script lang="ts">
  import { PDFViewer, type CommandsPlugin, type PluginRegistry } from '@embedpdf/svelte-pdf-viewer';

  let registry = $state.raw<PluginRegistry | null>(null);

  const print = () =>
    registry?.getPlugin<CommandsPlugin>('commands')?.provides().execute('document:print');
</script>

<button disabled={!registry} onclick={print}>Print</button>
<PDFViewer config={{ src: { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' } }} style="height: 80vh" onready={(r) => (registry = r)} />
-->

<script lang="ts">
  import { PDFViewer, type Viewer } from '@cloudpdf/viewer-svelte';

  let viewer = $state.raw<Viewer | null>(null);
</script>

<button disabled={!viewer} onclick={() => viewer?.commands.execute('document:print')}>Print</button>
<PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} onready={(v) => (viewer = v)} style="height: 80vh" />
