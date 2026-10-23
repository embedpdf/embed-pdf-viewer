<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, AnnotationMenu, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import SelectTextBox from './SelectTextBox.svelte';
  import SelectionActions from './SelectionActions.svelte';

  import '../menu.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  // [!doc-source notice]
  const notice = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-notice.pdf');
    return { kind: 'bytes', id: 'notice', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
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
