<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import TabTools from './TabTools.svelte';
  import Tabs from './Tabs.svelte';

  import '../tabs.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[
    { source: ebook, name: 'Contract' },
    { source: ebook, name: 'Report' },
  ]}
>
  <Tabs {ebook} />
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <TabTools />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
