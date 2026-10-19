<script lang="ts">
  import { annotationKey, useCommentThreads } from '@embedpdf/svelte/annotation';
  import { useStage } from '@embedpdf/svelte/stage';

  const threads = useCommentThreads();
  const stage = useStage();
</script>

{#each threads.current as thread (annotationKey(thread.root.ref))}
  <button onclick={() => stage.reveal(thread.page, { rect: thread.root.rect })}>
    {thread.root.contents}, page {thread.pageLabel}
  </button>
{/each}
