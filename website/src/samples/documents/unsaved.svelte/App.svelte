<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { metadataPlugin } from '@embedpdf/svelte/metadata';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import ChangeLog from './ChangeLog.svelte';
  import TitleBar from './TitleBar.svelte';

  import '../unsaved.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome, name: 'welcome.pdf' }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <TitleBar />
    <ChangeLog />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
