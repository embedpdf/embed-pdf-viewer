<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { localEngine } from '@embedpdf/engine';
  import ShowColors from './ShowColors.svelte';

  import '../dark-mode.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    searchPlugin(),
  ];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  // Your app's own switch: the colors are in the stylesheet, under [data-theme='dark'].
  let theme: 'light' | 'dark' = $state('dark');
</script>

<div class="pdf-viewer" data-theme={theme}>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Theme">
      <button type="button" aria-pressed={theme === 'light'} onclick={() => (theme = 'light')}>
        Light
      </button>
      <button type="button" aria-pressed={theme === 'dark'} onclick={() => (theme = 'dark')}>
        Dark
      </button>
    </div>
  </div>
  <Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
    <DocumentGate>
      {#snippet fallback()}
        <p class="loading">Loading…</p>
      {/snippet}
      <ShowColors />
      <Stage class="stage">
        <RenderLayer />
        <SearchLayer />
        <SelectionLayer />
      </Stage>
    </DocumentGate>
  </Viewer>
</div>
