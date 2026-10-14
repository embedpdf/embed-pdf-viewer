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

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ScriptConsole />
  </DocumentGate>
</Viewer>
