<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { SelectionLayer, SelectionMenu, selectionPlugin } from '@embedpdf/svelte/selection';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import Menu from './Menu.svelte';
  import OnLoad from './OnLoad.svelte';

  import '../layers.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    searchPlugin(),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<script lang="ts">
  let showSearch = $state(true);
  let showSelection = $state(true);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <OnLoad />
    <div class="toolbar">
      <label class="option">
        <input type="checkbox" bind:checked={showSearch} />
        Search matches
      </label>
      <label class="option">
        <input type="checkbox" bind:checked={showSelection} />
        Text selection
      </label>
    </div>
    <!-- Layers draw inside each page, later ones on top; the overlay floats above them. -->
    <Stage class="stage">
      <RenderLayer />
      {#if showSearch}
        <SearchLayer />
      {/if}
      {#if showSelection}
        <SelectionLayer />
      {/if}
      {#snippet overlay()}
        {#if showSelection}
          <SelectionMenu>
            <Menu />
          </SelectionMenu>
        {/if}
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
