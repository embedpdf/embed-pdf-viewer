<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { cloudEngine } from '@cloudpdf/engine';
  import WebsiteRules from './WebsiteRules.svelte';

  import '../rules.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // Websites open only on a click, as the page's example registers it.
  const plugins = [
    actionsPlugin({
      policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
    }),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <WebsiteRules />
  </DocumentGate>
</Viewer>
