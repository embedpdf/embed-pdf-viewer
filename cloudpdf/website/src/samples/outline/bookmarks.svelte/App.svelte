<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { outlinePlugin } from '@embedpdf/svelte/outline';
  import { cloudEngine } from '@cloudpdf/engine';
  import Bookmarks from './Bookmarks.svelte';

  import '../bookmarks.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), outlinePlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="layout">
      <Bookmarks />
      <Stage class="stage">
        <RenderLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
