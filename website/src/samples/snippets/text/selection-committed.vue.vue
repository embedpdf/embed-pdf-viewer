<script setup lang="ts">
import { useSelectionEvent } from '@embedpdf/vue/selection';

import { prefetchTranslation } from './translation';

useSelectionEvent(
  (selection) => selection.onCommitted,
  () => prefetchTranslation(),
);
</script>
