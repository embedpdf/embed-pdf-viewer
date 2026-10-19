<!--
  A Stage whose page content takes the page (`{#snippet children(page)}`), with page chrome and an
  overlay; its two-way page (`bind:page`) and zoom are bound to props a test sets and reads back
  through `seen`.
-->
<script lang="ts">
  import { Stage, type StageTokenProp } from '../../src/stage';
  import OverlayProbe from './OverlayProbe.svelte';
  import PageProbe from './PageProbe.svelte';

  let {
    token,
    pageIndex = $bindable(),
    zoom = $bindable(),
    seen = { pageIndex: [], zoom: [] },
  }: {
    token?: StageTokenProp;
    pageIndex?: number;
    zoom?: number;
    seen?: { pageIndex: unknown[]; zoom: unknown[] };
  } = $props();

  $effect(() => {
    seen.pageIndex.push(pageIndex);
  });
  $effect(() => {
    seen.zoom.push(zoom);
  });
</script>

<Stage {token} bind:page={pageIndex} bind:zoom class="stage" style="height: 600px">
  {#snippet children(page)}
    <span class="page" data-index={page.pageIndex}>{page.pageIndex + 1}</span>
    <PageProbe />
  {/snippet}
  {#snippet pageChrome(page)}
    <span class="chrome">Page {page.pageIndex + 1}</span>
  {/snippet}
  {#snippet overlay()}
    <OverlayProbe />
  {/snippet}
</Stage>
