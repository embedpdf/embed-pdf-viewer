<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { cloudEngine } from '@cloudpdf/engine';
  import CommandPalette from './CommandPalette.svelte';

  import '../palette.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    commandsPlugin({ commands: standardCommands }),
  ];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="layout">
      <CommandPalette />
      <Stage class="stage">
        <RenderLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
