<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { fetchDocumentToken } from './api';
  import { engine, plugins } from './pdf';

  let { documentId }: { documentId: string } = $props();
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[{ source: { kind: 'token', token: () => fetchDocumentToken(documentId) } }]}
/>
