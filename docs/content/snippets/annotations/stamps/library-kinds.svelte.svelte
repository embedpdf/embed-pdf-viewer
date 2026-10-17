<script lang="ts">
  import { useStampLibraries } from '@embedpdf/svelte/stamp';

  const libraries = useStampLibraries({ kind: ['stamps', 'legal-seals'] });
</script>

<ul>
  {#each libraries.current as library (library.id)}
    <li>{library.name}</li>
  {/each}
</ul>
