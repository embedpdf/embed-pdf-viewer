<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { type Annotation, useAnnotationAnchor, useCommentThread } from '@embedpdf/svelte/annotation';

  let { note }: { note: Annotation } = $props();

  const anchor = useAnnotationAnchor(() => note.ref);
  const thread = useCommentThread(() => note.ref);
</script>

<Anchored anchor={anchor.current} placement="right" gap={4} pinned>
  <span class="badge">{thread.current?.replies.length ?? 0}</span>
</Anchored>
