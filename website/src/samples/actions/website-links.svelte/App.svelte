<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { localEngine } from '@embedpdf/engine';
  import AskBeforeOpening from './AskBeforeOpening.svelte';

  import '../website-links.css';

  const engine = localEngine();
  const plugins = [actionsPlugin()];

  const links = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/links.pdf');
    return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AskBeforeOpening />
  </DocumentGate>
</Viewer>
