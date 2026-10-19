<!-- Two sizes, as `useToolbarItem()` picks: the toolbar must measure the one it draws. -->
<script lang="ts">
  import { useToolbarItem } from '@embedpdf/viewer-svelte';

  const item = useToolbarItem();
</script>

<span
  data-check="sized"
  data-drawn={item.variant ?? 'none'}
  style="display: inline-block; overflow: hidden; width: {item.variant === 'short' ? 48 : 700}px"
>
  Sized
</span>
