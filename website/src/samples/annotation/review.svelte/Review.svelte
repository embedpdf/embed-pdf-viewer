<!-- A thread's verdict, its check mark, and the buttons the user may use. -->
<script lang="ts">
  import { useComments, type CommentThreadView } from '@embedpdf/svelte/annotation';

  let { thread }: { thread: CommentThreadView } = $props();

  const comments = useComments();
  const ref = $derived(thread.root.ref);
  const verdict = $derived(thread.review.lastChange?.state ?? 'none');
  const marked = $derived(thread.review.markedBy.length > 0);
</script>

<article class="thread">
  <p class="comment">
    <strong>{thread.root.author}</strong>
    {thread.root.contents}
  </p>
  <p class="verdict">
    <span class="state state--{verdict}">{verdict}</span>
    {#if marked}
      <span class="mark">✓ checked off</span>
    {/if}
  </p>
  <div class="actions">
    <button
      type="button"
      class="button"
      disabled={!comments.canSetStatus(ref)}
      onclick={() => comments.setStatus(ref, 'accepted')}
    >
      Accept
    </button>
    <button
      type="button"
      class="button"
      disabled={!comments.canSetStatus(ref)}
      onclick={() => comments.setStatus(ref, 'rejected')}
    >
      Reject
    </button>
    <button
      type="button"
      class="button"
      aria-pressed={marked}
      disabled={!comments.canSetMarked(ref)}
      onclick={() => comments.setMarked(ref, !marked)}
    >
      ✓
    </button>
    <button
      type="button"
      class="button"
      disabled={!comments.canDeleteThread(ref)}
      onclick={() => comments.deleteThread(ref)}
    >
      Delete
    </button>
  </div>
</article>
