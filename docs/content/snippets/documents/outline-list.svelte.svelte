<script lang="ts">
  import { useOutline, useOutlineState } from '@embedpdf/svelte/outline';

  const outline = useOutline();
  const state = useOutlineState();
</script>

<ul role="tree">
  {#each state.rows as { item, depth, hasChildren, expanded } (item.ref.objectNumber)}
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-current={item.ref.objectNumber === state.current?.objectNumber ? 'location' : undefined}
      style:padding-inline-start="{depth * 16}px"
    >
      {#if hasChildren}
        <button onclick={() => outline.toggle(item.ref)}>{expanded ? '▾' : '▸'}</button>
      {/if}
      <button onclick={() => outline.activate(item.ref)}>{item.title}</button>
    </li>
  {/each}
</ul>
