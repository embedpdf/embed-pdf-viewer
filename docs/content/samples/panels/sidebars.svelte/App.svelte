<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { searchPlugin } from '@embedpdf/svelte/search';
  import { shellPlugin } from '@embedpdf/svelte/shell';
  import { localEngine } from '@embedpdf/engine';
  import Workspace from './Workspace.svelte';

  import '../sidebars.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), searchPlugin(), shellPlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Workspace />
  </DocumentGate>
</Viewer>
