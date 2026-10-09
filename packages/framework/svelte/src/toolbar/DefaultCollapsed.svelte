<!--
  The default folded group: a <select> for `collapse: 'select'`, else a "More"-style button with a
  menu of the group's commands.
-->
<script lang="ts">
  import DefaultOverflowMenu from './DefaultOverflowMenu.svelte';
  import DefaultOverflowTrigger from './DefaultOverflowTrigger.svelte';
  import { groupMenuView } from '@embedpdf/core-ui';
  import type { CollapsedGroupView } from './views';
  import { BORDER, SURFACE } from './paint';

  let { view }: { view: CollapsedGroupView } = $props();

  let isOpen = $state(false);
  const active = $derived(view.commands.find((command) => command.active)?.id ?? '');
  const menu = $derived(groupMenuView(view, isOpen, () => (isOpen = false)));
</script>

{#if view.collapse === 'select'}
  <select
    value={active}
    onchange={(event) => view.execute(event.currentTarget.value)}
    style:padding="4px 6px"
    style:font="inherit"
    style:border-radius="4px"
    style:border="1px solid {BORDER}"
    style:background={SURFACE}
  >
    {#each view.commands as command (command.id)}
      <option value={command.id} disabled={!command.enabled}>{command.label}</option>
    {/each}
  </select>
{:else}
  <span style="position: relative; display: inline-flex">
    <DefaultOverflowTrigger {isOpen} toggle={() => (isOpen = !isOpen)} />
    <DefaultOverflowMenu view={menu} />
  </span>
{/if}
