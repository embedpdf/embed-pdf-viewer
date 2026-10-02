<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { cloudEngine } from '@cloudpdf/engine';
  import PageCard from './PageCard.svelte';

  import '../basic.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // No Stage: a page on its own needs only the render plugin.
  const plugins = [renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PageCard />
  </DocumentGate>
</Viewer>
