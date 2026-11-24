<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { localEngine } from '@embedpdf/engine';
  import RequiredTags from './RequiredTags.svelte';
  import ViewButtons from './ViewButtons.svelte';

  import '../tags.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

  const forms = async (): Promise<OpenInput> => {
    const response = await fetch('https://www.embedpdf.com/pdfs/forms.pdf');
    return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: forms }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ViewButtons />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer />
      {#snippet overlay()}
        <RequiredTags />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
