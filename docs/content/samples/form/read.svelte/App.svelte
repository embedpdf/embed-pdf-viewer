<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { localEngine } from '@embedpdf/engine';
  import FieldList from './FieldList.svelte';
  import Greeting from './Greeting.svelte';

  import '../read.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

  // [!doc-source forms]
  const forms = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-forms.pdf');
    return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: forms }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Greeting />
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <FormLayer />
      </Stage>
      <FieldList />
    </div>
  </DocumentGate>
</Viewer>
