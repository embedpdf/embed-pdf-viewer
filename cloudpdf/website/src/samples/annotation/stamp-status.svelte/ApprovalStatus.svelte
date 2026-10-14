<!--
  One stamp's status, pinned to it: a check on its corner once it's signed off, and a status with
  a button under it. Both stay there while the stamp moves.
-->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useAnnotationAnchor, type Annotation } from '@embedpdf/svelte/annotation';

  let {
    stamp,
    signedOff,
    onToggle,
  }: { stamp: Annotation; signedOff: boolean; onToggle: () => void } = $props();

  const anchor = useAnnotationAnchor(() => stamp.ref);
</script>

{#if signedOff}
  <Anchored anchor={anchor.current} placement="top-end" gap={-12} pinned>
    <span class="check">✓</span>
  </Anchored>
{/if}
<Anchored anchor={anchor.current} placement="bottom" gap={8} pinned>
  <div class="status">
    <span class={['dot', signedOff && 'dot--done']}></span>
    {signedOff ? 'Signed off' : 'Waiting'}
    <button type="button" class={['sign', signedOff && 'sign--undo']} onclick={onToggle}>
      {signedOff ? 'Undo' : 'Sign off'}
    </button>
  </div>
</Anchored>
