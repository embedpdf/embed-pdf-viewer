<script lang="ts">
  import { useSelectionEvent } from '@embedpdf/svelte/selection';

  import { prefetchTranslation } from './translation';

  useSelectionEvent(
    (selection) => selection.onCommitted,
    () => prefetchTranslation(),
  );
</script>
