<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Scrollbar, Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import ReadingProgress from './ReadingProgress.svelte';

  import '../scrollbar.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ReadingProgress />
    <Stage class="stage">
      <RenderLayer />
      {#snippet overlay()}
        <Scrollbar axis="y" autoHide={1200} class="scrollbar" thumbClass="thumb" />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
