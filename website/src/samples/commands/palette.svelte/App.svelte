<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { localEngine } from '@embedpdf/engine';
  import CommandPalette from './CommandPalette.svelte';

  import '../palette.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    commandsPlugin({ commands: standardCommands }),
  ];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
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
