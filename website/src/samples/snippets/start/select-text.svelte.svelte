<script lang="ts">
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    <Stage style="height: 500px">
      <RenderLayer />
      <SelectionLayer />
    </Stage>
  </DocumentGate>
</Viewer>
