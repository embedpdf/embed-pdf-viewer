<!-- Every change, once the engine has saved it, newest first. -->
<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';

  interface Entry {
    id: number;
    text: string;
    origin: string;
  }

  let entries = $state.raw<Entry[]>([]);
  let nextId = 0;
  const log = (text: string, origin: string) =>
    (entries = [{ id: nextId++, text, origin }, ...entries].slice(0, 30));

  useAnnotationEvent(
    (annotation) => annotation.onCreated,
    ({ annotation, origin }) =>
      log(`${annotation.author ?? 'Someone'} added a ${annotation.subtype}`, origin.kind),
  );
  useAnnotationEvent(
    (annotation) => annotation.onUpdated,
    ({ annotation, origin }) => log(`Changed a ${annotation.subtype}`, origin.kind),
  );
  useAnnotationEvent(
    (annotation) => annotation.onDeleted,
    ({ refs, origin }) =>
      log(
        `Deleted ${refs.length === 1 ? 'one annotation' : `${refs.length} annotations`}`,
        origin.kind,
      ),
  );
  useAnnotationEvent(
    (annotation) => annotation.onMoved,
    ({ refs, toIndex, origin }) =>
      log(`Moved ${refs.length} to position ${toIndex + 1}`, origin.kind),
  );
</script>

<ol class="panel log">
  {#if entries.length === 0}
    <li class="empty">Nothing yet</li>
  {/if}
  {#each entries as entry (entry.id)}
    <li class="entry">
      <span>{entry.text}</span>
      <span class="origin">{entry.origin}</span>
    </li>
  {/each}
</ol>
