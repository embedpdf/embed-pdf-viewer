<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import ZoomBar from './ZoomBar.svelte';

  import '../deep-zoom.css';

  const engine = cloudEngine();
  // Open at 250%: past what a whole-page picture shows sharply, so tiles carry it.
  const plugins = [stagePlugin({ zoom: { level: 2.5 } }), renderPlugin()];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ZoomBar />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
