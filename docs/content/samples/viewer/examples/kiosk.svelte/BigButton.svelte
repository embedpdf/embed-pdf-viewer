<script lang="ts">
  import { useCommand } from '@embedpdf/viewer-svelte';
  import { ICONS } from './icons';

  // One of the kiosk's commands, drawn big enough for a finger.
  let { id, primary = false }: { id: string; primary?: boolean } = $props();
  const command = useCommand(() => id);
</script>

<button
  type="button"
  class={primary ? 'kiosk-button primary' : 'kiosk-button'}
  disabled={!command.current.enabled}
  onclick={() => command.current.run()}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#each ICONS[command.current.icon ?? ''] ?? [] as d (d)}
      <path {d} />
    {/each}
  </svg>
  {command.current.label}
</button>
