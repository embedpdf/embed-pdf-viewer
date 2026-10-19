<!-- Both panels share the right side: opening one closes the other. -->
<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';

  let { id, label }: { id: string; label: string } = $props();

  const panel = useSurface(() => id);
</script>

<button
  type="button"
  class="button"
  aria-pressed={panel.isOpen}
  onclick={() => panel.toggle({ exclusive: 'right' })}
>
  {label}
</button>
