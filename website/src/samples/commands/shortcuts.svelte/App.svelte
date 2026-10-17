<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { localEngine } from '@embedpdf/engine';
  import ShortcutArea from './ShortcutArea.svelte';

  import '../shortcuts.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    commandsPlugin({ commands: standardCommands }),
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
    <ShortcutArea />
  </DocumentGate>
</Viewer>
