<script lang="ts">
  import { annotationKey } from '@embedpdf/svelte/annotation';
  import { usePendingRedactions, useRedaction } from '@embedpdf/svelte/redaction';
  import { useStage } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const redaction = useRedaction();
  const marks = usePendingRedactions();
</script>

<ul>
  {#each marks.current as mark (annotationKey(mark.ref))}
    <li>
      <button onclick={() => stage.reveal(mark.page, { rect: mark.bounds })}>
        Page {mark.pageIndex + 1}: {mark.kind === 'text' ? 'text' : 'area'}
      </button>
      <button onclick={() => redaction.unmark([mark.ref])}>Remove</button>
    </li>
  {/each}
</ul>
