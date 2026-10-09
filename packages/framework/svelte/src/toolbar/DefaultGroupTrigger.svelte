<!--
  The default button of a group that shed items: a chevron opening a menu of what it shed, lit
  while the active item is in there.
-->
<script lang="ts">
  import DefaultOverflowMenu from './DefaultOverflowMenu.svelte';
  import { groupMenuView } from '@embedpdf/core-ui';
  import type { GroupDisclosureView } from './views';
  import { ACTIVE, BORDER } from './paint';

  let { view }: { view: GroupDisclosureView } = $props();

  let isOpen = $state(false);
  const someActive = $derived(view.commands.some((command) => command.active));
  const menu = $derived(groupMenuView(view, isOpen, () => (isOpen = false)));
</script>

<span style="position: relative; display: inline-flex">
  <button
    type="button"
    onclick={() => (isOpen = !isOpen)}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    title="More"
    style:display="inline-flex"
    style:align-items="center"
    style:padding="4px 6px"
    style:color="inherit"
    style:font="inherit"
    style:border="1px solid {BORDER}"
    style:border-radius="4px"
    style:background={isOpen || someActive ? ACTIVE : 'transparent'}
    style:cursor="pointer"
  >
    ▾
  </button>
  <DefaultOverflowMenu view={menu} />
</span>
