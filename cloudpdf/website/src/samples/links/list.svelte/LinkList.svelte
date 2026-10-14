<!-- The first page's links, read from the plugin, each with a button that follows it. -->
<script lang="ts">
  import { useLink, useLinkEvent } from '@embedpdf/svelte/link';

  let { ready }: { ready: boolean } = $props();

  const link = useLink();
  let last = $state<string | null>(null);

  // Every way of following a link ends up here: a click, a key, or code.
  useLinkEvent(
    (plugin) => plugin.onActivated,
    ({ target, activation }) => (last = `${target.kind} → ${activation.outcome}`),
  );

  const links = $derived(ready ? link.listLinks(0) : []);
</script>

<aside class="panel">
  <h3 class="heading">Links on page 1</h3>
  <ul class="links">
    {#each links as item (item.id)}
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
