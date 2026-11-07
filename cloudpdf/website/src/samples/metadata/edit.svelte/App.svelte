<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { metadataPlugin } from '@embedpdf/svelte/metadata';
  import { cloudEngine } from '@cloudpdf/engine';
  import PropertiesEditor from './PropertiesEditor.svelte';

  import '../edit.css';

  const engine = cloudEngine();
  const plugins = [metadataPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PropertiesEditor />
  </DocumentGate>
</Viewer>
