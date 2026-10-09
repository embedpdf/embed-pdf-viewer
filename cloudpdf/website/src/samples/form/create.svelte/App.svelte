<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { cloudEngine } from '@cloudpdf/engine';
  import BuildToolbar from './BuildToolbar.svelte';

  import '../create.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <BuildToolbar />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
