<script lang="ts">
  import { onMount } from 'svelte';
  import { useStage, useStageEvent } from '@embedpdf/svelte/stage';

  interface Entry {
    id: number;
    event: string;
    detail: string;
  }

  // The latest stage events, newest first. Scroll, zoom or resize to add more.
  const stage = useStage();
  let entries = $state<Entry[]>([]);
  let count = 0;
  const log = (event: string, detail: string) => {
    entries = [{ id: count++, event, detail }, ...entries].slice(0, 6);
  };

  useStageEvent(
    (stage) => stage.onPageChanged,
    ({ pageIndex, previousPageIndex }) =>
      log('onPageChanged', `page ${previousPageIndex + 1} → ${pageIndex + 1}`),
  );
  useStageEvent(
    (stage) => stage.onZoomChanged,
    ({ level, mode }) => log('onZoomChanged', `${Math.round(level * 100)}%, ${mode}`),
  );
  useStageEvent(
    (stage) => stage.onMotionEnded,
    ({ camera }) => log('onMotionEnded', `at rest, ${Math.round(camera.zoom * 100)}%`),
  );
  useStageEvent(
    (stage) => stage.onViewportChanged,
    ({ size }) =>
      log('onViewportChanged', `${Math.round(size.width)} × ${Math.round(size.height)}`),
  );

  // Glide to the second page on load, so the log has something to show.
  onMount(() => {
    stage.goToPage(1);
  });
</script>

<ol class="log" aria-live="polite">
  {#each entries as entry (entry.id)}
    <li class="entry">
      <code class="name">{entry.event}</code>
      <span class="detail">{entry.detail}</span>
    </li>
  {/each}
</ol>
