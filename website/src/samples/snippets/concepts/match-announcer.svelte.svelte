<script lang="ts">
  import { useSearchEvent } from '@embedpdf/svelte/search';
  import { announce } from './announce';

  useSearchEvent(
    (search) => search.onCompleted,
    ({ hitCount }) => announce(`${hitCount} matches`),
  );
</script>
