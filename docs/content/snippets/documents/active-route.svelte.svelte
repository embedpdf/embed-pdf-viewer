<script lang="ts">
  import { goto } from '$app/navigation';
  import { useDocumentsEvent } from '@embedpdf/svelte/runtime';

  useDocumentsEvent(
    (documents) => documents.onActiveChanged,
    ({ documentId }) => goto(`/documents/${documentId}`, { replaceState: true }),
  );
</script>
