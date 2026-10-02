<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import Results from './Results.svelte';
  import SearchBox from './SearchBox.svelte';

  import '../results-list.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

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
    <SearchBox />
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <SearchLayer />
      </Stage>
      <Results />
    </div>
  </DocumentGate>
</Viewer>
