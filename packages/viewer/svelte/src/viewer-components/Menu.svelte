<!--
  A button that opens a menu of `MenuItem`s, the viewer's own `<epdf-menu>`: it opens the way the
  viewer's menus do, away from its bar, flipped when there's no room, and up from the bottom on a
  phone.
-->
<script lang="ts">
  import type { MenuProps } from './props';

  let { icon, label, children }: MenuProps = $props();
</script>

<!-- What's left out is null: the element writes its properties to attributes, `undefined` too. -->
<epdf-menu icon={icon ?? null} {label}>{@render children?.()}</epdf-menu>
