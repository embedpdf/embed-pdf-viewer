<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';
  import { notifyThreadAuthor } from './notifications'; // your own

  useAnnotationEvent(
    (annotation) => annotation.comments.onThreadChanged,
    ({ rootRef, change }) => change === 'reply' && notifyThreadAuthor(rootRef),
  );
</script>

<aside><!-- … --></aside>
