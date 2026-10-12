<script lang="ts">
  import { Toolbar, group } from '@embedpdf/svelte/toolbar';
  import Icon from './Icon.svelte';

  const rail = {
    id: 'rail',
    sections: {
      start: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'])],
      end: [group('zoom', ['zoom:in', 'zoom:out'])],
    },
  };
</script>

<Toolbar bar={rail} orientation="vertical" aria-label="Tools" style="height: 100%">
  {#snippet command(cmd, _variant, run)}
    <button onclick={run} disabled={!cmd.enabled} aria-pressed={cmd.active} title={cmd.label}>
      <Icon name={cmd.icon} />
    </button>
  {/snippet}
</Toolbar>
