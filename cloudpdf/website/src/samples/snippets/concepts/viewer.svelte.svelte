<script lang="ts">
  import { DocumentGate, Viewer } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { engine, plugins, source } from './pdf';
  import Toolbar from './Toolbar.svelte';
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source }]}>
  <Toolbar />
  <DocumentGate>
    {#snippet fallback()}
      <p>Opening…</p>
    {/snippet}
    <Stage>
      {#snippet page()}
        <RenderLayer />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
