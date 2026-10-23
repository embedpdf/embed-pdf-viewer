<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { cloudEngine } from '@cloudpdf/engine';
  import LinkList from './LinkList.svelte';

  import '../list.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), linkPlugin()];

  const links: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="layout">
      <LinkList />
      <Stage class="stage">
        <RenderLayer />
        <LinkLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
