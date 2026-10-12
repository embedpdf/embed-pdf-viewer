<!--
  A row in a `Menu`, the viewer's own `<epdf-menu-item>`: its text is the row's. `command` makes it
  that command's row; picking it runs the command, and calls `onselect` either way (the element's
  `select` event).
-->
<script lang="ts">
  import type { MenuItemProps } from './props';

  let { command, icon, onselect, children }: MenuItemProps = $props();
</script>

<!-- What's left out is null: the element writes its properties to attributes, `undefined` too. -->
<epdf-menu-item command={command ?? null} icon={icon ?? null} {onselect}
  >{@render children?.()}</epdf-menu-item
>
