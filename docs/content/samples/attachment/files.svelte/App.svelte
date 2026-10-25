<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { attachmentPlugin } from '@embedpdf/svelte/attachment';
  import { localEngine } from '@embedpdf/engine';
  import Files from './Files.svelte';

  import '../files.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), attachmentPlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="layout">
      <Files />
      <Stage class="stage">
        <RenderLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
