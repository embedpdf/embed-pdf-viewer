<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { outlinePlugin } from '@embedpdf/svelte/outline';
  import { cloudEngine } from '@cloudpdf/engine';
  import OutlineEditor from './OutlineEditor.svelte';

  import '../nesting.css';

  const engine = cloudEngine();
  const plugins = [outlinePlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <OutlineEditor />
  </DocumentGate>
</Viewer>
