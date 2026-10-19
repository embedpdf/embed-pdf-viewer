<script lang="ts">
  import { Toolbar, group, item } from '@embedpdf/svelte/toolbar';
  import Icon from './Icon.svelte';

  const bar = {
    id: 'main',
    sections: {
      start: [group('navigation', ['page:previous', 'page:next'])],
      center: [group('zoom', ['zoom:out', item('zoom:in', { variants: ['icon+label', 'icon'] })])],
      end: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'], { collapse: 'menu' })],
    },
  };
</script>

<Toolbar {bar}>
  {#snippet command(cmd, variant, run)}
    <button onclick={run} disabled={!cmd.enabled} aria-pressed={cmd.active} title={cmd.label}>
      <Icon name={cmd.icon} />
      {#if variant === 'icon+label'}{cmd.label}{/if}
    </button>
  {/snippet}
</Toolbar>
