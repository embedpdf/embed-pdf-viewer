<script lang="ts">
  import { useDocumentsEvent } from '@embedpdf/svelte/runtime';

  let message = $state('');

  useDocumentsEvent(
    (documents) => documents.onOpenFailed,
    ({ error }) => (message = `Couldn't open the file: ${error.message}`),
  );
</script>

<p role="alert">{message}</p>
