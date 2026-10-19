<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import { dana, roles, type Role } from './roles';
  import Toolbar from './Toolbar.svelte';

  import '../identity.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  let role = $state<Role>('reader');
</script>

<Viewer
  {engine}
  {plugins}
  identity={dana}
  scope={roles[role]}
  initialDocuments={[{ source: ebook, name: 'ebook.pdf' }]}
>
  <Toolbar bind:role {ebook} />
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
