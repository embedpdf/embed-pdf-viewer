<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import { dana, roles, type Role } from './roles';
  import Toolbar from './Toolbar.svelte';

  import '../identity.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
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
