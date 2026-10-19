<!--
  The publish check's app (`tooling/build/src/check-framework-package.mjs`): the documented setup,
  type-checked against the packed package as a user installs it.
-->
<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { localEngine } from '@embedpdf/engine';
  import Toolbar from './Toolbar.svelte';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    searchPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
  ];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p>Loading…</p>
    {/snippet}
    <Toolbar />
    <Stage class="stage">
      <RenderLayer />
      <SearchLayer />
      <AnnotationLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
