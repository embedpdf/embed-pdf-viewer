<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { localEngine } from '@embedpdf/engine';
  import ScriptConsole from './ScriptConsole.svelte';

  import '../javascript.css';

  const engine = localEngine();
  // JavaScript on, and two fields scripts often ask for about the user.
  const plugins = [
    actionsPlugin({
      javascript: { enabled: true, identity: { name: 'Dana Smith', corporation: 'Acme' } },
    }),
  ];

  // [!doc-source links]
  const links = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/links.pdf');
    return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ScriptConsole />
  </DocumentGate>
</Viewer>
