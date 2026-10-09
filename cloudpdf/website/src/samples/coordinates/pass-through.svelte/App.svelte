<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import Hits from './Hits.svelte';

  import '../pass-through.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="layout">
      <Hits />
      <Stage class="stage">
        <RenderLayer />
        <SearchLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
