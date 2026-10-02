<!-- Who wrote each annotation, and when: the engine fills these in from the identity. -->
<script lang="ts">
  import { annotationKey, useAnnotationList } from '@embedpdf/svelte/annotation';

  const annotations = useAnnotationList();

  const time = (date: string | null) =>
    date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
</script>

<ul class="panel authors">
  {#if annotations.current.length === 0}
    <li class="empty">Draw something</li>
  {/if}
  {#each annotations.current as annotation (annotationKey(annotation.ref))}
    <li class="author">
      <span class="kind">{annotation.subtype}</span>
      <span>{annotation.author ?? 'Nobody'} · {time(annotation.createdAt)}</span>
    </li>
  {/each}
</ul>
