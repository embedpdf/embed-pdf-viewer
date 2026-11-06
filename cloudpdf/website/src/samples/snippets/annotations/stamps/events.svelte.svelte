<script lang="ts">
  import { useStampEvent } from '@embedpdf/svelte/stamp';

  let message = $state('');

  useStampEvent(
    (stamp) => stamp.onLibraryChanged,
    ({ libraryId, type }) => (message = `${libraryId}: ${type}`),
  );
</script>

<p aria-live="polite">{message}</p>
