<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionHandles, SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { localEngine } from '@embedpdf/engine';
  import ColorPicker from './ColorPicker.svelte';
  import SelectTitle from './SelectTitle.svelte';

  import '../colors.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin({ handles: { shadow: '0 1px 3px rgb(0 0 0 / 0.3)' } }),
  ];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  let fromCss = $state(false);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SelectTitle />
    <div class="toolbar">
      <ColorPicker />
      <label class="option">
        <input type="checkbox" bind:checked={fromCss} />
        Override with CSS
      </label>
    </div>
    <Stage class={fromCss ? 'stage from-css' : 'stage'}>
      <RenderLayer />
      <SelectionLayer />
      {#snippet overlay()}
        <SelectionHandles />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
