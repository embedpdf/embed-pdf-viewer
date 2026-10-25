<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { outlinePlugin } from '@embedpdf/svelte/outline';
  import { cloudEngine } from '@cloudpdf/engine';
  import OutlineEditor from './OutlineEditor.svelte';

  import '../nesting.css';

  const engine = cloudEngine();
  const plugins = [outlinePlugin()];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <OutlineEditor />
  </DocumentGate>
</Viewer>
