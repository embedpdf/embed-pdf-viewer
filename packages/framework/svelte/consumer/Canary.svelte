<!--
  The publish check's canary: each line marked "error expected" must be an error, proof that the
  published types aren't `any`.
-->
<script lang="ts">
  import { useSearch, useSearchState, notASearchExport } from '@embedpdf/svelte/search'; // error expected
  import { useForm } from '@embedpdf/svelte/form';
  import { Stage } from '@embedpdf/svelte/stage';

  const search = useSearch();
  search.notASearchMethod(); // error expected
  const searchState = useSearchState();
  const wrong: string = searchState.hitCount; // error expected
  useForm().notAFormMethod(); // error expected
  void [notASearchExport, wrong];
</script>

<Stage notAStageProp={1} /><!-- error expected -->
