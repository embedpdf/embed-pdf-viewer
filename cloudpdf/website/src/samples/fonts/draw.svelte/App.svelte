<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { fontsPlugin } from '@embedpdf/svelte/fonts';
  import { cloudEngine } from '@cloudpdf/engine';
  import FontPreview from './FontPreview.svelte';

  import '../draw.css';

  const engine = cloudEngine();
  const plugins = [fontsPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FontPreview />
  </DocumentGate>
</Viewer>
