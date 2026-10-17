<script lang="ts">
  import { useStage, useStageSettings, useStageState } from '@embedpdf/svelte/stage';

  let { narrow = $bindable() }: { narrow: boolean } = $props();

  const stage = useStage();
  // One breakpoint drives both the layout and this toolbar.
  const compact = useStageState((state) => state.activeRules.includes('compact'));
  const settings = useStageSettings();
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Stage width">
    <button type="button" aria-pressed={!narrow} onclick={() => (narrow = false)}>
      Full width
    </button>
    <button type="button" aria-pressed={narrow} onclick={() => (narrow = true)}>360 px</button>
  </div>
  <output class="badge" data-on={compact.current}>
    compact <strong>{compact.current ? 'on' : 'off'}</strong>
  </output>
  <output class="badge">
    padding <strong>{settings.padding}</strong> · spread <strong>{settings.spread}</strong>
  </output>
  <div class="pager">
    <button type="button" class="button" onclick={() => stage.previousPage()}>
      {compact.current ? '‹' : '‹ Previous'}
    </button>
    <button type="button" class="button" onclick={() => stage.nextPage()}>
      {compact.current ? '›' : 'Next ›'}
    </button>
  </div>
</div>
