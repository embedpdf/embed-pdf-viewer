<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { localEngine } from '@embedpdf/engine';
  import BrowserActions from './BrowserActions.svelte';

  import '../custom.css';

  const engine = localEngine();
  // The actions plugin runs a link that names a viewer command, such as the footer's Next.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    actionsPlugin(),
    linkPlugin(),
  ];

  // [!doc-source links]
  const links = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-links.pdf');
    return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<script lang="ts">
  let shown = $state(true);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <BrowserActions />
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Link areas">
        <button type="button" aria-pressed={shown} onclick={() => (shown = true)}>
          Show link areas
        </button>
        <button type="button" aria-pressed={!shown} onclick={() => (shown = false)}>
          As the PDF has them
        </button>
      </div>
    </div>
    <Stage class="stage">
      <RenderLayer />
      <LinkLayer>
        {#snippet link({ link, native })}
          {#if shown}
            <!-- Wrapping `native` keeps what a click does. -->
            <span class="pdf-link" data-kind={link.target.kind}>{@render native()}</span>
          {:else}
            <!-- The layer's own, invisible area. -->
            {@render native()}
          {/if}
        {/snippet}
      </LinkLayer>
    </Stage>
  </DocumentGate>
</Viewer>
