<script lang="ts">
  import { useDocumentsEvent } from '@embedpdf/svelte/runtime';

  let entries = $state<string[]>([]);

  useDocumentsEvent(
    (documents) => documents.onUnsavedChangesChanged,
    ({ hasUnsavedChanges }) => {
      entries = [
        hasUnsavedChanges
          ? 'It has changes that weren’t downloaded'
          : 'Downloaded: nothing to lose',
        ...entries,
      ];
    },
  );
</script>

<ul class="log" aria-live="polite">
  {#each entries.slice(0, 3) as entry, index (entries.length - index)}
    <li>{entry}</li>
  {/each}
</ul>
