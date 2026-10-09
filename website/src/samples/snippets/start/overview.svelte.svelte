<script lang="ts">
  import { DocumentGate, Viewer } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { localEngine } from '@embedpdf/engine';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: { kind: 'url', url: '/contract.pdf' } }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p>Opening…</p>
    {/snippet}
    <Stage style="height: 600px">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
