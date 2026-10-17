<script lang="ts">
  import { useStampEvent } from '@embedpdf/svelte/stamp';

  let message = $state('');

  useStampEvent(
    (stamp) => stamp.onLibraryChanged,
    ({ libraryId, reason }) => (message = `${libraryId}: ${reason}`),
  );
</script>

<p aria-live="polite">{message}</p>
