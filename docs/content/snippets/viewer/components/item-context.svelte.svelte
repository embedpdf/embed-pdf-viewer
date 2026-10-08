<script lang="ts">
  import { useToolbarItem } from '@embedpdf/viewer-svelte';

  let { people }: { people: { id: string; name: string; avatar: string }[] } = $props();
  const item = useToolbarItem(); // item.orientation is 'horizontal' or 'vertical'
</script>

<div class="reviewers {item.orientation}">
  {#each people as person (person.id)}
    <img src={person.avatar} alt={person.name} title={person.name} />
  {/each}
</div>
