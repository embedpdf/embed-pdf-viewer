<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { searchPlugin } from '@embedpdf/svelte/search';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import ActiveMatch from './ActiveMatch.svelte';
  import Pages from './Pages.svelte';

  import '../click-match.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ActiveMatch />
    <Pages />
  </DocumentGate>
</Viewer>
