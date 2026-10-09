<script lang="ts">
  import { useSearchEvent } from '@embedpdf/svelte/search';

  let message = $state('');

  useSearchEvent(
    (search) => search.onCompleted,
    ({ hitCount }) => (message = `${hitCount} matches`),
  );
</script>

<p aria-live="polite">{message}</p>
