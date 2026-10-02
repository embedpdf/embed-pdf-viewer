<!-- The viewer actions a PDF's buttons name, run from your own buttons. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useActions, useActionsUiAdapter, type PdfNamedAction } from '@embedpdf/svelte/actions';
  import { useStageState } from '@embedpdf/svelte/stage';

  const VERBS: ReadonlyArray<[PdfNamedAction, string]> = [
    ['FirstPage', '⇤ First'],
    ['PrevPage', '‹ Previous'],
    ['NextPage', 'Next ›'],
    ['LastPage', 'Last ⇥'],
    ['Print', 'Print'],
  ];

  const actions = useActions();
  const stageState = useStageState();
  let ran = $state<string | null>(null);

  // Print goes to your UI adapter. This one says so, instead of opening the browser's print dialog.
  useActionsUiAdapter({ print: () => (ran = 'Print: your print handler ran') });

  // On load, as if a "Last page" button in the PDF was clicked. Running it twice changes nothing.
  onMount(() => {
    void actions.executeNamed('LastPage').then(({ status }) => (ran = `LastPage: ${status}`));
  });

  async function runNamed(name: PdfNamedAction) {
    const { status } = await actions.executeNamed(name);
    if (name !== 'Print') ran = `${name}: ${status}`;
  }
</script>

<div class="toolbar">
  {#each VERBS as [name, label] (name)}
    <button
      type="button"
      class="button"
      disabled={!actions.canExecuteNamed(name)}
      onclick={() => runNamed(name)}
    >
      {label}
    </button>
  {/each}
  <span class="spacer"></span>
  <output class="readout">
    Page {stageState.currentPageIndex + 1} of {stageState.pageCount}
    {#if ran}
      <span class="ran"> · {ran}</span>
    {/if}
  </output>
</div>
