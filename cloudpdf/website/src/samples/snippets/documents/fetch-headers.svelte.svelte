<script lang="ts">
  import { DocumentGate, Viewer } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { getToken } from './auth';
  import { engine, plugins } from './pdf';

  const withToken = (url: string, init: RequestInit) =>
    fetch(url, { ...init, headers: { Authorization: `Bearer ${getToken()}` } });
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[{ source: { kind: 'url', url: '/api/files/contract.pdf' } }]}
  fetch={withToken}
>
  <DocumentGate>
    <Stage>
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
