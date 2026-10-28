<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { selectionPlugin } from '@embedpdf/svelte/selection';
  import { shellPlugin } from '@embedpdf/svelte/shell';
  import { cloudEngine } from '@cloudpdf/engine';
  import Workspace from './Workspace.svelte';

  import '../menus.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    shellPlugin(),
  ];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Workspace />
  </DocumentGate>
</Viewer>
