<!-- Every thread in the document, in reading order. -->
<script lang="ts">
  import { annotationKey, useAnnotationState, useCommentThreads } from '@embedpdf/svelte/annotation';
  import Thread from './Thread.svelte';

  const threads = useCommentThreads();
  const loading = useAnnotationState((state) => state.status === 'loading');
</script>

<div class="panel threads">
  {#if loading.current}
    <p class="empty">Loading comments…</p>
  {:else if threads.current.length === 0}
    <p class="empty">No comments</p>
  {/if}
  {#each threads.current as thread (annotationKey(thread.root.ref))}
    <Thread {thread} />
  {/each}
</div>
