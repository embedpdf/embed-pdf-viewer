<script lang="ts" module>
  import { group, type BarSchema } from '@embedpdf/svelte/toolbar';

  // A bar per mode.
  const viewBar: BarSchema = {
    id: 'view',
    sections: {
      start: [group('tools', ['tool:pointer', 'tool:pan'])],
      center: [
        group('pages', ['page:previous', 'page:next']),
        group('zoom', ['zoom:out', 'zoom:in']),
      ],
    },
  };

  const annotateBar: BarSchema = {
    id: 'annotate',
    sections: {
      start: [group('markup', ['tool:highlight', 'tool:underline', 'tool:strikeout'])],
      center: [group('draw', ['tool:ink', 'tool:square', 'tool:circle', 'tool:note'])],
      end: [group('edit', ['annotation:delete'])],
    },
  };

  const MODES = ['view', 'annotate'] as const;
  type Mode = (typeof MODES)[number];
  const BARS: Record<Mode, BarSchema> = { view: viewBar, annotate: annotateBar };
  const TOOL_OF_MODE: Record<Mode, string> = { view: 'pointer', annotate: 'highlight' };
</script>

<script lang="ts">
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import { Toolbar } from '@embedpdf/svelte/toolbar';

  const interaction = useInteraction();
  let mode = $state<Mode>('view');

  // Each mode starts with its own tool.
  function switchTo(next: Mode) {
    mode = next;
    interaction.activateTool(TOOL_OF_MODE[next]);
  }
</script>

<div class="chrome">
  <div class="modes" role="tablist" aria-label="Mode">
    {#each MODES as each (each)}
      <button
        type="button"
        role="tab"
        class="mode"
        aria-selected={mode === each}
        onclick={() => switchTo(each)}
      >
        {each === 'view' ? 'View' : 'Annotate'}
      </button>
    {/each}
  </div>
  <Toolbar bar={BARS[mode]} class="toolbar">
    {#snippet command(cmd, _variant, run)}
      <button
        type="button"
        class="button"
        disabled={!cmd.enabled}
        aria-pressed={cmd.active}
        onclick={run}
      >
        {cmd.label}
      </button>
    {/snippet}
  </Toolbar>
</div>
