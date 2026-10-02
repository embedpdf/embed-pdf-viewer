<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, StageToken, stagePlugin } from '@embedpdf/svelte/stage';
  import { commandsPlugin, standardCommands, type CommandDef } from '@embedpdf/svelte/commands';
  import { localEngine } from '@embedpdf/engine';
  import Toolbar from './Toolbar.svelte';

  import '../custom.css';

  const engine = localEngine();

  // A command of your own: pressed while the pages show two at a time.
  const twoPages: CommandDef = {
    id: 'layout:two-pages',
    label: 'Two pages',
    categories: ['layout'],
    active: ({ get }) => get(StageToken).getSettings().spread === 'odd',
    run: ({ get }) => {
      const stage = get(StageToken);
      stage.updateSettings({ spread: stage.getSettings().spread === 'odd' ? 'none' : 'odd' });
    },
  };

  const plugins = [
    stagePlugin(),
    renderPlugin(),
    commandsPlugin({ commands: [...standardCommands, twoPages] }),
  ];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
