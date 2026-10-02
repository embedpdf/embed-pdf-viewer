<script setup lang="ts">
import { useDocumentsEvent } from '@embedpdf/vue/runtime';

useDocumentsEvent(
  (documents) => documents.onUnsavedChangesChanged,
  ({ hasUnsavedChanges }) => {
    document.title = hasUnsavedChanges ? '● Contract' : 'Contract';
  },
);
</script>
