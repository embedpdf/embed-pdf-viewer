<!--
  A toolbar button, the viewer's own: `<epdf-button>`, which the viewer draws like the buttons in
  its bars. `command` makes it that command's button; or give it an `icon`, a `label` and an
  `onclick`. Use it inside the viewer: in a `ToolbarItem`, a `Panel` or a `Region`.
-->
<script lang="ts">
  import type { ButtonProps } from './props';

  let { command, icon, label, onclick, class: className, style }: ButtonProps = $props();
</script>

<!-- What's left out is null: the element writes its properties to attributes, `undefined` too.
     It draws a real button in its own shadow root, which takes the keys and fires the click. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<epdf-button
  command={command ?? null}
  icon={icon ?? null}
  label={label ?? null}
  {onclick}
  class={className}
  {style}
></epdf-button>
