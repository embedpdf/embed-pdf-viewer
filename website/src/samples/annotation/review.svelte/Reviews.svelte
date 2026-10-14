<script lang="ts">
  import { annotationKey, useCommentThreads } from '@embedpdf/svelte/annotation';
  import Review from './Review.svelte';

  const threads = useCommentThreads();
</script>

<div class="panel threads">
  {#if threads.current.length === 0}
    <p class="empty">No comments</p>
  {/if}
  {#each threads.current as thread (annotationKey(thread.root.ref))}
    <Review {thread} />
  {/each}
</div>
