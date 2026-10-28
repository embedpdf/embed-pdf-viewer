<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { cloudEngine } from '@cloudpdf/engine';
  import WebsiteRules from './WebsiteRules.svelte';

  import '../rules.css';

  const engine = cloudEngine();
  // Websites open only on a click, as the page's example registers it.
  const plugins = [
    actionsPlugin({
      policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
    }),
  ];

  const links: OpenInput = { kind: 'share', shareToken: 'shr_xs-9Y5qwuYrJ2BKtWzuo_2xy' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <WebsiteRules />
  </DocumentGate>
</Viewer>
