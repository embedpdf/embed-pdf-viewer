<!-- The item itself: "Page 3 of 120", or "3 / 120" when there's less room. -->
<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  let { compact }: { compact: boolean } = $props();

  const stage = useStage();
  const stageState = useStageState();
  let typed: string | null = $state(null);

  function jump(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const number = Number(typed);
    if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
    typed = null;
  }
</script>

<label class="page-number">
  {#if !compact}Page{/if}
  <input
    class="page-input"
    inputmode="numeric"
    aria-label="Page number"
    value={typed ?? String(stageState.currentPageIndex + 1)}
    onfocus={(event) => event.currentTarget.select()}
    oninput={(event) => (typed = event.currentTarget.value)}
    onblur={() => (typed = null)}
    onkeydown={jump}
  />
  {compact ? `/ ${stageState.pageCount}` : `of ${stageState.pageCount}`}
</label>
