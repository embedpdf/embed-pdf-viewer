<!-- The default "More" button: a plain ⋯ that shows whether its menu is open. -->
<script lang="ts">
  import { ACTIVE, BORDER } from './paint';

  let { isOpen, toggle }: { isOpen: boolean; toggle: () => void } = $props();
</script>

<button
  type="button"
  onclick={toggle}
  aria-haspopup="menu"
  aria-expanded={isOpen}
  title="More"
  style:display="inline-flex"
  style:align-items="center"
  style:padding="4px 8px"
  style:color="inherit"
  style:font="inherit"
  style:border="1px solid {BORDER}"
  style:border-radius="4px"
  style:background={isOpen ? ACTIVE : 'transparent'}
  style:cursor="pointer"
>
  ⋯
</button>
