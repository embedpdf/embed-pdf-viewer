<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';

  // The engine is created synchronously and costs nothing until first use, so
  // a module-scope `const engine = …` is safe — even under SSR. Only opening a
  // document does real work: the UI renders at t≈0.
  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <div style="height: 500px">
    <!-- Document UI is defined over a document — gate it on having one. -->
    <DocumentGate>
      {#snippet fallback()}
        <p>Loading…</p>
      {/snippet}
      <Stage style="height: 100%">
        <RenderLayer />
      </Stage>
    </DocumentGate>
  </div>
</Viewer>
