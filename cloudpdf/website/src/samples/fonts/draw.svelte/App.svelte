<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { fontsPlugin } from '@embedpdf/svelte/fonts';
  import { cloudEngine } from '@cloudpdf/engine';
  import FontPreview from './FontPreview.svelte';

  import '../draw.css';

  const engine = cloudEngine();
  const plugins = [fontsPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FontPreview />
  </DocumentGate>
</Viewer>
