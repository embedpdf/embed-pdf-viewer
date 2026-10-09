<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { metadataPlugin } from '@embedpdf/svelte/metadata';
  import { cloudEngine } from '@cloudpdf/engine';
  import Properties from './Properties.svelte';

  import '../properties.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [metadataPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Properties />
  </DocumentGate>
</Viewer>
