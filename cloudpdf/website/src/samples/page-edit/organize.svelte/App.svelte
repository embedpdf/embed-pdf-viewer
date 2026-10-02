<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { pageEditPlugin } from '@embedpdf/svelte/page-edit';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { cloudEngine } from '@cloudpdf/engine';
  import PageOrganizer from './PageOrganizer.svelte';

  import '../organize.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [renderPlugin(), pageEditPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PageOrganizer />
  </DocumentGate>
</Viewer>
