<script lang="ts">
  import { useDocumentsEvent } from '@embedpdf/svelte/runtime';

  let pageCount = $state(0);

  useDocumentsEvent(
    (documents) => documents.onPagesChanged,
    ({ pages }) => (pageCount = pages.length),
  );
</script>

<span>{pageCount} pages</span>
