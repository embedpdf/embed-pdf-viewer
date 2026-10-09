<!--
  A menu over the text selection, once the selection settles. One anchor for the whole
  selection, even across pages: it sits on the page the gesture ended on. Hidden while the user
  is still dragging, it appears when the pointer lifts; a selection made from code shows it at
  once. It works in a `<Stage>`'s overlay and in a `<PageView>` alike: the surface gives the
  projection.

  For UI that follows the selection during the drag, use `<Anchored>` with
  `useSelection().getAnchor()` yourself: this component is that, plus the hiding.
-->
<script lang="ts">
  import { SelectionToken } from '@embedpdf/plugin-selection';
  import { samePageBounds } from '@embedpdf/web';
  import Anchored from '../anchored/Anchored.svelte';
  import { useOptionalSelector } from '../runtime/readers.svelte';
  import type { SelectionMenuProps } from './props';
  import { useSelectionState } from './readers.svelte';

  let { children, gap = 8, placement = 'top' }: SelectionMenuProps = $props();

  const selecting = useSelectionState((selectionState) => selectionState.isSelecting);
  // Every read gives a new anchor: compared by page and box, so the menu moves only when the
  // selection did.
  const anchor = useOptionalSelector(
    SelectionToken,
    (selection) => selection.getAnchor(),
    null,
    samePageBounds,
  );
</script>

{#if !selecting.current && anchor.current}
  <Anchored anchor={anchor.current} {placement} {gap}>
    {@render children()}
  </Anchored>
{/if}
