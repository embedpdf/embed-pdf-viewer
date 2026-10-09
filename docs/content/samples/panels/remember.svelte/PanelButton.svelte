<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';

  let { id, label, side }: { id: string; label: string; side: 'left' | 'right' } = $props();

  const panel = useSurface(() => id);
</script>

<button
  type="button"
  class="button"
  aria-pressed={panel.isOpen}
  onclick={() => panel.toggle({ exclusive: side })}
>
  {label}
</button>
