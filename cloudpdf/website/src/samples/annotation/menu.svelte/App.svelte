<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, AnnotationMenu, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import SelectTextBox from './SelectTextBox.svelte';
  import SelectionActions from './SelectionActions.svelte';

  import '../menu.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  const notice: OpenInput = { kind: 'grant', grant: 'shr_LfeeUer1ogBI9mz8eYkWXa0d' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: notice }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SelectTextBox />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      <AnnotationLayer />
      {#snippet overlay()}
        <AnnotationMenu placement="bottom">
          <SelectionActions />
        </AnnotationMenu>
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
