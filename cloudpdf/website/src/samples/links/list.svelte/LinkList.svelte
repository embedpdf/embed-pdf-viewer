<!-- The first page's links, read from the plugin, each with a button that follows it. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useLink, useLinkEvent, type Link } from '@embedpdf/svelte/link';

  const link = useLink();
  let items = $state.raw<readonly Link[]>([]);
  let last = $state<string | null>(null);

  onMount(() => {
    void link.ensureLoaded(0).then(() => (items = link.listLinks(0)));
  });

  // Every way of following a link ends up here: a click, a key, or code.
  useLinkEvent(
    (plugin) => plugin.onActivated,
    ({ target, activation }) => (last = `${target.kind} → ${activation.outcome}`),
  );
</script>

<aside class="panel">
  <h3 class="heading">Links on page 1</h3>
  <ul class="links">
    {#each items as item (item.id)}
      <li class="link">
        <span class="kind">{item.target.kind}</span>
        <span class="label">{link.getLabel(item)}</span>
        <span class="where">
          at {Math.round(item.bounds.x)}, {Math.round(item.bounds.y)}
        </span>
        <button type="button" class="button" onclick={() => link.activate(item)}>Follow</button>
      </li>
    {/each}
  </ul>
  <p class="last">
    <code>onActivated</code>
    {last ?? 'not yet'}
  </p>
</aside>
