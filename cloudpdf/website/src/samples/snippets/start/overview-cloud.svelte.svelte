<script lang="ts">
  import { DocumentGate, Viewer } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { cloudEngine } from '@cloudpdf/engine';
  import { fetchDocumentToken } from './api';

  const engine = cloudEngine({ baseUrl: 'https://pdf.example.com' });
  const plugins = [stagePlugin(), renderPlugin()];
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[{ source: { kind: 'token', token: () => fetchDocumentToken('contract') } }]}
>
  <DocumentGate>
    {#snippet fallback()}
      <p>Opening…</p>
    {/snippet}
    <Stage style="height: 600px">
      {#snippet page()}
        <RenderLayer />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
