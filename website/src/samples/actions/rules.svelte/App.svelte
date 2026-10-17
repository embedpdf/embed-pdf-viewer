<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { localEngine } from '@embedpdf/engine';
  import WebsiteRules from './WebsiteRules.svelte';

  import '../rules.css';

  const engine = localEngine();
  // Websites open only on a click, as the page's example registers it.
  const plugins = [
    actionsPlugin({
      policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
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
    <WebsiteRules />
  </DocumentGate>
</Viewer>
