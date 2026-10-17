<script lang="ts" module>
  import type { ShellSnapshot } from '@embedpdf/svelte/shell';

  // The browser may refuse storage, in a private window: then nothing is remembered.
  const loadLayout = (): ShellSnapshot | null => {
    try {
      return JSON.parse(localStorage.getItem('panels') ?? 'null') as ShellSnapshot | null;
    } catch {
      return null;
    }
  };
  const saveLayout = (snapshot: ShellSnapshot) => {
    try {
      localStorage.setItem('panels', JSON.stringify(snapshot));
    } catch {
      // Not remembered this time.
    }
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { useShell, useShellState } from '@embedpdf/svelte/shell';
  import NotesPanel from './NotesPanel.svelte';
  import PanelButton from './PanelButton.svelte';
  import TipsPanel from './TipsPanel.svelte';

  const shell = useShell();
  const shellState = useShellState();
  let saved: ShellSnapshot | null = $state.raw(loadLayout());

  // The layout saved last time, or the tips the first time.
  onMount(() => {
    const layout = loadLayout();
    if (layout) shell.applySnapshot(layout);
    else shell.open('tips', { exclusive: 'left' });
  });

  function save() {
    const layout = shell.getSnapshot();
    saveLayout(layout);
    saved = layout;
  }

  const open = $derived(shellState.openSurfaces.map((surface) => surface.id).join(', '));
</script>

<div class="toolbar">
  <PanelButton id="tips" label="Tips" side="left" />
  <PanelButton id="notes" label="Notes" side="right" />
  <span class="spacer"></span>
  <button type="button" class="button" onclick={save}>Save layout</button>
  <button
    type="button"
    class="button"
    disabled={!saved}
    onclick={() => saved && shell.applySnapshot(saved)}
  >
    Restore
  </button>
</div>
<p class="readout">Open: {open || 'no panels'}</p>
<div class="workspace">
  <TipsPanel />
  <Stage class="stage">
    <RenderLayer />
  </Stage>
  <NotesPanel />
</div>
