<script lang="ts">
  import { SearchLayer, useSearch } from '@embedpdf/svelte/search';

  const search = useSearch();
</script>

<SearchLayer onHitClick={(hit) => search.goToHit(hit)} />
