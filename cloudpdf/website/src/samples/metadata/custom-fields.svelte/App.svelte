<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { metadataPlugin } from '@embedpdf/svelte/metadata';
  import { cloudEngine } from '@cloudpdf/engine';
  import CustomFields from './CustomFields.svelte';

  import '../custom-fields.css';

  const engine = cloudEngine();
  const plugins = [metadataPlugin()];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <CustomFields />
  </DocumentGate>
</Viewer>
