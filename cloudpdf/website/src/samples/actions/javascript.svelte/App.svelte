<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { cloudEngine } from '@cloudpdf/engine';
  import ScriptConsole from './ScriptConsole.svelte';

  import '../javascript.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // JavaScript on, and two fields scripts often ask for about the user.
  const plugins = [
    actionsPlugin({
      javascript: { enabled: true, identity: { name: 'Dana Smith', corporation: 'Acme' } },
    }),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ScriptConsole />
  </DocumentGate>
</Viewer>
