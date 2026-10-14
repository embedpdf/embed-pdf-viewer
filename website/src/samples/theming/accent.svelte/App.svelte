<script lang="ts" module>
  import { DocumentGate, Viewer, epdfTheme, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { localEngine } from '@embedpdf/engine';
  import SelectTitle from './SelectTitle.svelte';

  import '../accent.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

  const SWATCHES = ['#3858e9', '#e91e63', '#0f6e56', '#c2410c'];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  let accent = $state('#e91e63');
</script>

<div class="pdf-viewer" style={epdfTheme({ accent })}>
  <div class="toolbar">
    <label class="picker">
      Accent
      <input type="color" bind:value={accent} />
    </label>
    {#each SWATCHES as swatch (swatch)}
      <button
        type="button"
        class="swatch"
        aria-label="Accent {swatch}"
        aria-pressed={swatch === accent}
        style:background={swatch}
        onclick={() => (accent = swatch)}
      ></button>
    {/each}
    <code class="value">--epdf-accent: {accent}</code>
  </div>
  <Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
    <DocumentGate>
      {#snippet fallback()}
        <p class="loading">Loading…</p>
      {/snippet}
      <SelectTitle />
      <Stage class="stage">
        <RenderLayer />
        <SelectionLayer />
      </Stage>
    </DocumentGate>
  </Viewer>
</div>
