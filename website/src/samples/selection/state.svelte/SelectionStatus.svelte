<!-- Every field of the selection's state, as it changes. -->
<script lang="ts">
  import { useSelectionState } from '@embedpdf/svelte/selection';

  const state = useSelectionState();
</script>

<dl class="status">
  <div class="field">
    <dt>hasSelection</dt>
    <dd>{String(state.hasSelection)}</dd>
  </div>
  <div class="field" data-live={state.isSelecting}>
    <dt>isSelecting</dt>
    <dd>{String(state.isSelecting)}</dd>
  </div>
  <div class="field">
    <dt>pages</dt>
    <dd>{state.pages.length === 1 ? '1 page' : `${state.pages.length} pages`}</dd>
  </div>
  <div class="field">
    <dt>range</dt>
    <dd>{state.range ? `${state.range.start.index} → ${state.range.end.index}` : 'null'}</dd>
  </div>
</dl>
