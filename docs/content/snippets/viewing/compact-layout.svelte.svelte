<script lang="ts">
  import { useStageState } from '@embedpdf/svelte/stage';
  import BottomSheet from './BottomSheet.svelte';
  import SidePanel from './SidePanel.svelte';

  const state = useStageState();
  const compact = $derived(state.activeRules.includes('compact'));
</script>

{#if compact}
  <BottomSheet />
{:else}
  <SidePanel />
{/if}
