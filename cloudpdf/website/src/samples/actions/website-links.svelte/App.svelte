<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { cloudEngine } from '@cloudpdf/engine';
  import AskBeforeOpening from './AskBeforeOpening.svelte';

  import '../website-links.css';

  const engine = cloudEngine();
  const plugins = [actionsPlugin()];

  const links: OpenInput = { kind: 'share', shareToken: 'shr_xs-9Y5qwuYrJ2BKtWzuo_2xy' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AskBeforeOpening />
  </DocumentGate>
</Viewer>
