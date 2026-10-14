<!-- While Space is held over the pages, the hand tool is active; on release, the tool from before. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useInteraction } from '@embedpdf/svelte/interaction';

  let { children }: { children: Snippet } = $props();

  const interaction = useInteraction();
  // Only over the pages, so Space still scrolls the rest of your page.
  let viewer: HTMLDivElement | undefined = $state();
  let held = false;

  function down(event: KeyboardEvent) {
    if (event.code !== 'Space' || !viewer?.matches(':hover')) return;
    event.preventDefault();
    if (event.repeat || held) return;
    held = true;
    interaction.pushTool('pan');
  }

  function up(event: KeyboardEvent) {
    if (event.code !== 'Space' || !held) return;
    held = false;
    interaction.popTool();
  }
</script>

<svelte:window onkeydown={down} onkeyup={up} />

<div bind:this={viewer} class="viewer">
  {@render children()}
</div>
