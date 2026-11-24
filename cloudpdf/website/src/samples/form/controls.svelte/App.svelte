<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin, type FieldControl } from '@embedpdf/svelte/form';
  import { cloudEngine } from '@cloudpdf/engine';
  import Switch from './Switch.svelte';
  import ViewButtons from './ViewButtons.svelte';

  import '../controls.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

  const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

  // The first control that matches a box draws it; the layer draws every other box.
  const controls: FieldControl[] = [
    {
      for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox',
      component: Switch,
    },
  ];
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: forms }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ViewButtons />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer {controls} />
    </Stage>
  </DocumentGate>
</Viewer>
