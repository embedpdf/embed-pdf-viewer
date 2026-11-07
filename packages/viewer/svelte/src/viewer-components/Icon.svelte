<!--
  One of the viewer's icons, or one of yours (`icons`), by `name`: the viewer's own `<epdf-icon>`,
  `size` px square (20, a toolbar button's icon, unless you say), in the color of the text around
  it. With a `label`, screen readers read it; without one, they skip it. Use it inside the viewer:
  in a `ToolbarItem`, a `Panel` or a `Region`.
-->
<script lang="ts">
  import type { IconProps } from './props';

  let { name, size, label, class: className, style }: IconProps = $props();
</script>

<!-- What's left out is null: the element writes its properties to attributes, `undefined` too. -->
<epdf-icon {name} size={size ?? null} label={label ?? null} class={className} {style}></epdf-icon>
