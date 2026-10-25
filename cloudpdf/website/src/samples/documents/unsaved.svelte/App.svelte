<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { metadataPlugin } from '@embedpdf/svelte/metadata';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import ChangeLog from './ChangeLog.svelte';
  import TitleBar from './TitleBar.svelte';

  import '../unsaved.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome, name: 'welcome.pdf' }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <TitleBar />
    <ChangeLog />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
