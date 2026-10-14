<script lang="ts">
  import { onMount } from 'svelte';
  import {
    indexedDbByteStore,
    persistStampLibraries,
    restoreStampLibraries,
    useStamp,
    useStampLibraries,
  } from '@embedpdf/svelte/stamp';

  const store = indexedDbByteStore('stamps');
  const stamp = useStamp();
  const libraries = useStampLibraries();

  onMount(() => {
    void restoreStampLibraries(stamp, store); // import every stored library
    return persistStampLibraries(stamp, store, { except: ['embedpdf-standard'] });
  });
</script>

<ul>
  {#each libraries.current as library (library.id)}
    <li>{library.name}</li>
  {/each}
</ul>
