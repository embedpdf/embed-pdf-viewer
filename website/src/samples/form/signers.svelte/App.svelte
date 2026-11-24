<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { signaturePlugin } from '@embedpdf/svelte/signature';
  import { localEngine } from '@embedpdf/engine';
  import HandOver from './HandOver.svelte';
  import SignCard from './SignCard.svelte';
  import { people, type Person } from './people';
  import Toolbar from './Toolbar.svelte';

  import '../signers.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
    // An empty signature field becomes a button. With no key, a mark is drawn into the field.
    signaturePlugin(),
  ];

  const loan = async (): Promise<OpenInput> => {
    const response = await fetch('https://www.embedpdf.com/pdfs/loan.pdf');
    return {
      kind: 'bytes',
      id: 'loan',
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  };

  const everyone = Object.keys(people) as Person[];
</script>

<script lang="ts">
  let person = $state<Person>('sender');
</script>

<Viewer
  {engine}
  {plugins}
  scope={people[person].scope}
  initialDocuments={[{ source: loan, name: 'equipment-loan.pdf' }]}
>
  <div class="toolbar">
    <span class="label">Open the form as</span>
    <div class="segments">
      {#each everyone as each (each)}
        <button
          type="button"
          class="segment"
          aria-pressed={person === each}
          onclick={() => (person = each)}
        >
          {people[each].name}
        </button>
      {/each}
    </div>
  </div>
  <HandOver {person} />
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <Toolbar {person} />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
      <FormLayer />
      {#snippet overlay()}
        <SignCard />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
