<script lang="ts">
  import { useAnnotation, type CommentThread } from '@embedpdf/svelte/annotation';
  import { useStage } from '@embedpdf/svelte/stage';

  let { thread }: { thread: CommentThread } = $props();

  const stage = useStage();
  const annotation = useAnnotation();

  function show() {
    stage.reveal(thread.page, { rect: thread.root.rect });
    annotation.selection.set([thread.root.ref]); // and select it
  }
</script>

<button onclick={show}>Show</button>
