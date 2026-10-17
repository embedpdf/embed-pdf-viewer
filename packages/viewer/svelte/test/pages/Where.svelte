<!-- Where its toolbar item sits, as `useToolbarItem()` says it. -->
<script lang="ts">
  import { useToolbarItem } from '@embedpdf/viewer-svelte';

  const item = useToolbarItem();
</script>

<span
  data-check="where"
  data-edge={item.edge}
  data-size={item.size}
  data-variant={item.variant ?? 'none'}
  style="display: inline-flex; flex-direction: {item.orientation === 'vertical' ? 'column' : 'row'}"
  >{item.orientation}</span
>
