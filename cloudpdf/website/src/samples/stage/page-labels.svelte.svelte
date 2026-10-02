<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';

  import './page-labels.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

  // Reserve a 26px band below every page: the label lives there, so it never
  // covers the page and keeps its size when you zoom.
  const plugins = [stagePlugin({ pageFrame: { bottom: 26 } }), renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Stage class="stage">
      <RenderLayer />
      {#snippet pageChrome(page)}
        <div class="page-label" style:height="{page.frame.bottom}px">
          Page {page.pageIndex + 1}
        </div>
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
