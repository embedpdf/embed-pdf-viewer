<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { cloudEngine } from '@cloudpdf/engine';
  import CommandButton from './CommandButton.svelte';

  import '../buttons.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), commandsPlugin({ commands: standardCommands })];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="toolbar">
      <CommandButton id="page:previous" />
      <CommandButton id="page:next" />
      <CommandButton id="zoom:out" />
      <CommandButton id="zoom:in" />
      <CommandButton id="zoom:fit-width" />
      <CommandButton id="view:rotate-clockwise" />
      <CommandButton id="document:download" />
    </div>
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
