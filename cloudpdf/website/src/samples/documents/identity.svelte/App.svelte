<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import { dana, roles, type Role } from './roles';
  import Toolbar from './Toolbar.svelte';

  import '../identity.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<script lang="ts">
  let role = $state<Role>('reader');
</script>

<Viewer
  {engine}
  {plugins}
  identity={dana}
  scope={roles[role]}
  initialDocuments={[{ source: welcome, name: 'welcome.pdf' }]}
>
  <Toolbar bind:role {welcome} />
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
