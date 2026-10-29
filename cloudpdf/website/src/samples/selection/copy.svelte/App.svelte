<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionClipboard, SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { cloudEngine } from '@cloudpdf/engine';
  import CopyButton from './CopyButton.svelte';
  import SelectedText from './SelectedText.svelte';
  import SelectTitle from './SelectTitle.svelte';

  import '../copy.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SelectTitle />
    <SelectionClipboard />
    <CopyButton />
    <SelectedText />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
    </Stage>
  </DocumentGate>
</Viewer>
