<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { cloudEngine } from '@cloudpdf/engine';
  import ToolSwitch from './ToolSwitch.svelte';

  import '../switch.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // The document opens with the hand tool.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin({ defaultTool: 'pan' }),
    selectionPlugin(),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ToolSwitch />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
    </Stage>
  </DocumentGate>
</Viewer>
