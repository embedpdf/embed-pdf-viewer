<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import {
    SelectionClipboard,
    SelectionLayer,
    SelectionMenu,
    selectionPlugin,
  } from '@embedpdf/svelte/selection';
  import { localEngine } from '@embedpdf/engine';
  import SelectionActions from './SelectionActions.svelte';
  import SelectTitle from './SelectTitle.svelte';

  import '../menu.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

  const PLACEMENTS = ['top', 'bottom', 'left', 'right'] as const;
  type Placement = (typeof PLACEMENTS)[number];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  let placement = $state<Placement>('top');
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SelectTitle />
    <SelectionClipboard />
    <div class="toolbar" role="group" aria-label="Where the menu goes">
      {#each PLACEMENTS as name (name)}
        <button
          type="button"
          class="segment"
          aria-pressed={placement === name}
          onclick={() => (placement = name)}
        >
          {name}
        </button>
      {/each}
    </div>
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      {#snippet overlay()}
        <SelectionMenu {placement} gap={8}>
          <SelectionActions />
        </SelectionMenu>
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
