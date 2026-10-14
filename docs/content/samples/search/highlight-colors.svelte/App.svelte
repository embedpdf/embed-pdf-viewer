<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import ColorPicker from './ColorPicker.svelte';

  import '../highlight-colors.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    searchPlugin({ highlight: { color: '#ffd500', activeColor: '#ff9632' } }),
  ];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<script lang="ts">
  let fromCss = $state(false);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="toolbar">
      <ColorPicker />
      <label class="option">
        <input type="checkbox" bind:checked={fromCss} />
        Override with CSS
      </label>
    </div>
    <Stage class={fromCss ? 'stage from-css' : 'stage'}>
      <RenderLayer />
      <SearchLayer />
    </Stage>
  </DocumentGate>
</Viewer>
