<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, SnapshotLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { localEngine } from '@embedpdf/engine';
  import SnapshotToolbar from './SnapshotToolbar.svelte';

  import '../snapshot.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin({ defaultTool: 'pan' })];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SnapshotToolbar />
    <Stage class="stage">
      <RenderLayer />
      <SnapshotLayer />
    </Stage>
  </DocumentGate>
</Viewer>
