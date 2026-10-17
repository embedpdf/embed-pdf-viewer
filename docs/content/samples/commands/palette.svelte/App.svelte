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

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
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
