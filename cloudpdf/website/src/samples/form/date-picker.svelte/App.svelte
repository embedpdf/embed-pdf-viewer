<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { cloudEngine } from '@cloudpdf/engine';
  import DatePicker from './DatePicker.svelte';
  import Refused from './Refused.svelte';

  import '../date-picker.css';

  const engine = cloudEngine();
  // No JavaScript here: the form plugin checks a typed date against the field's pattern itself.
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

  const invoice: OpenInput = { kind: 'grant', grant: 'shr_NCOaGzAKFsdI2r-UaVUJG7zL' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: invoice }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Refused />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer />
      {#snippet overlay()}
        <DatePicker />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
