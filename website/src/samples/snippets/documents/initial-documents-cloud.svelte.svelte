<script lang="ts">
  import { DocumentGate, Viewer } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { fetchDocumentToken } from './api';
  import { engine, plugins } from './pdf';
  import Spinner from './Spinner.svelte';
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[{ source: { kind: 'token', token: () => fetchDocumentToken('contract') } }]}
>
  <DocumentGate>
    {#snippet fallback()}
      <Spinner />
    {/snippet}
    <Stage>
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
