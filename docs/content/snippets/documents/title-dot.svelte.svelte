<script lang="ts">
  import { useDocumentsEvent } from '@embedpdf/svelte/runtime';

  useDocumentsEvent(
    (documents) => documents.onUnsavedChangesChanged,
    ({ hasUnsavedChanges }) => {
      document.title = hasUnsavedChanges ? '● Contract' : 'Contract';
    },
  );
</script>
