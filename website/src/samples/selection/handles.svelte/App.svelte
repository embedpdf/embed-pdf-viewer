<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import {
    SelectionHandles,
    SelectionLayer,
    SelectionMenu,
    selectionPlugin,
  } from '@embedpdf/svelte/selection';
  import { localEngine } from '@embedpdf/engine';
  import CopyButton from './CopyButton.svelte';
  import SelectWord from './SelectWord.svelte';

  import '../handles.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

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
    <SelectWord />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      {#snippet overlay()}
        <!-- Clear of the start handle's grip, which sits above the first line. -->
        <SelectionMenu gap={20}>
          <CopyButton />
        </SelectionMenu>
        <SelectionHandles />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
