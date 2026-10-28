<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import Results from './Results.svelte';
  import SearchBox from './SearchBox.svelte';

  import '../results-list.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
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
