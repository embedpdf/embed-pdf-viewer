<script lang="ts">
  import { useComments, type CommentThread } from '@embedpdf/svelte/annotation';

  let { thread }: { thread: CommentThread } = $props();
  const comments = useComments();
</script>

<button disabled={!comments.canReply(thread.root.ref)}>Reply</button>
<button disabled={!comments.canDeleteThread(thread.root.ref)}>Delete thread</button>
