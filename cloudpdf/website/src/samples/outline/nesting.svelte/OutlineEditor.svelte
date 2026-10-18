<!-- An outline being built: add items, nest them, fold them, rename and delete them. -->
<script lang="ts">
  import {
    useOutline,
    useOutlineState,
    type OutlineItem,
    type OutlineItemRef,
  } from '@embedpdf/svelte/outline';

  const outline = useOutline();
  const tree = useOutlineState();
  let title = $state('Chapter');

  const same = (left: OutlineItemRef | null, right: OutlineItemRef | null) =>
    left?.objectNumber === right?.objectNumber;
  const item = $derived(
    tree.items.find((each) => same(each.ref, tree.selected[0] ?? null)) ?? null,
  );
  // The item before the picked one among its parent's children: where an indent puts it.
  const previous = $derived.by(() => {
    if (!item) return null;
    const siblings = tree.items.filter((each) => same(each.parent, item.parent));
    return siblings[siblings.indexOf(item) - 1] ?? null;
  });
  const parent = $derived(tree.items.find((each) => same(each.ref, item?.parent ?? null)) ?? null);

  // After the picked item, or at the end.
  function add(inside: boolean) {
    void outline.create(
      inside && item
        ? { title, parent: item.ref }
        : { title, parent: item?.parent ?? null, position: item ? { after: item.ref } : 'end' },
      { select: true },
    );
  }

  // The move shows at once, so read `previous` before it: after it, the item has none.
  function indent() {
    const picked = item;
    const before = previous;
    if (!picked || !before) return;
    void outline.move([picked.ref], before.ref, 'end');
    outline.expand(before.ref);
  }

  function outdent() {
    if (item && parent) void outline.move([item.ref], parent.parent, { after: parent.ref });
  }

  function pick(row: OutlineItem) {
    outline.select([row.ref]);
    title = row.title;
  }
</script>

<div class="editor">
  <div class="toolbar">
    <input class="field" aria-label="Title" bind:value={title} />
    <button type="button" class="button" disabled={!tree.canEdit} onclick={() => add(false)}>
      Add
    </button>
    <button
      type="button"
      class="button"
      disabled={!tree.canEdit || !item}
      onclick={() => add(true)}
    >
      Add inside
    </button>
    <button type="button" class="button" disabled={!tree.canEdit || !previous} onclick={indent}>
      Indent
    </button>
    <button type="button" class="button" disabled={!tree.canEdit || !parent} onclick={outdent}>
      Outdent
    </button>
    <button
      type="button"
      class="button"
      disabled={!tree.canEdit || !item}
      onclick={() => item && outline.update(item.ref, { title })}
    >
      Rename
    </button>
    <button
      type="button"
      class="button"
      disabled={!tree.canEdit || !item}
      onclick={() => item && outline.delete([item.ref])}
    >
      Delete
    </button>
  </div>
  {#if tree.rows.length === 0}
    <p class="empty">This document has no outline yet. Add an item.</p>
  {:else}
    <ul class="tree" role="tree">
      {#each tree.rows as row (row.item.ref.objectNumber)}
        <li
          class="row"
          role="treeitem"
          aria-level={row.depth + 1}
          aria-expanded={row.hasChildren ? row.expanded : undefined}
          aria-selected={row.item.ref.objectNumber === item?.ref.objectNumber}
          style:padding-inline-start="{6 + row.depth * 18}px"
        >
          <button
            type="button"
            class="chevron"
            aria-label={row.expanded ? 'Collapse' : 'Expand'}
            disabled={!row.hasChildren}
            data-expanded={row.expanded || undefined}
            onclick={() => outline.toggle(row.item.ref)}
          ></button>
          <button type="button" class="row-title" onclick={() => pick(row.item)}>
            {row.item.title}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
