<script lang="ts">
  import { onMount } from 'svelte';
  import type { DocumentHandle } from '@cloudpdf/engine';

  let { doc, pageNumber }: { doc: DocumentHandle; pageNumber: number } = $props();

  let src = $state<string>();

  onMount(async () => {
    const { pages } = await doc.pages.list();
    const page = pages[pageNumber - 1];
    const image = await doc
      .page(page.pageObjectNumber)
      .render.image({ viewport: { kind: 'scale', scale: 1.5 } });
    src = (await image.objectUrl()).url;
  });
</script>

{#if src}
  <img
    {src}
    alt={`Page ${pageNumber}`}
    style="max-width: 100%; border: 1px solid #e6eaf2; border-radius: 8px"
  />
{:else}
  <p>Rendering page…</p>
{/if}
