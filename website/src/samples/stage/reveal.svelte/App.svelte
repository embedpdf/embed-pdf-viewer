<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin, type RevealZoom } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import SpotPicker from './SpotPicker.svelte';
  import { SPOTS } from './spots';

  import '../reveal.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  let active = $state(0);
  let zoom = $state<RevealZoom>('fit-width');
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SpotPicker bind:active bind:zoom />
    <Stage class="stage">
      <RenderLayer />
      {#snippet pageChrome(page)}
        {#each SPOTS as spot, index (spot.label)}
          {#if spot.page === page.pageIndex}
            <!-- Page coordinates become pixels only here, as the spot is drawn. -->
            {@const box = page.transform.pageToViewRect(spot.rect)}
            <div
              class="spot"
              data-active={index === active}
              style:left="{box.x}px"
              style:top="{box.y}px"
              style:width="{box.width}px"
              style:height="{box.height}px"
            ></div>
          {/if}
        {/each}
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
