<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { annotationPlugin } from '@embedpdf/svelte/annotation';
  import { fontsPlugin } from '@embedpdf/svelte/fonts';
  import { cloudEngine } from '@cloudpdf/engine';
  import Fonts from './Fonts.svelte';

  import '../list.css';

  const engine = cloudEngine();
  const plugins = [interactionPlugin(), annotationPlugin(), fontsPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Fonts />
  </DocumentGate>
</Viewer>
