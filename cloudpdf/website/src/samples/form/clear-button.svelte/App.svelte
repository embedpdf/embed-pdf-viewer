<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin, type FieldControl } from '@embedpdf/svelte/form';
  import { cloudEngine } from '@cloudpdf/engine';
  import TextBox from './TextBox.svelte';
  import Toolbar from './Toolbar.svelte';

  import '../clear-button.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

  const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

  // The one-line text boxes get the button; the layer draws every other box.
  const controls: FieldControl[] = [
    { for: (widget) => widget.control === 'text' && !widget.multiline, component: TextBox },
  ];
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: forms }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer {controls} />
    </Stage>
  </DocumentGate>
</Viewer>
