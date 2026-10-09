<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { cloudEngine } from '@cloudpdf/engine';
  import PageImages from './PageImages.svelte';

  import '../render-page.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // No Stage: these pictures are plain images, rendered on demand.
  const plugins = [renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PageImages />
  </DocumentGate>
</Viewer>
