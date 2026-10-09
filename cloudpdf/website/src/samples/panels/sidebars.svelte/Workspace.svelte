<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { SearchLayer } from '@embedpdf/svelte/search';
  import { useShell } from '@embedpdf/svelte/shell';
  import NotesPanel from './NotesPanel.svelte';
  import PanelButton from './PanelButton.svelte';
  import SearchPanel from './SearchPanel.svelte';

  const shell = useShell();
  // Your app's own data: it stays when the panel closes.
  let notes = $state('');

  // The search panel is open when the document is.
  onMount(() => {
    shell.open('search', { exclusive: 'right' });
  });
</script>

<div class="toolbar">
  <PanelButton id="search" label="Search" />
  <PanelButton id="notes" label="Notes" />
</div>
<div class="workspace">
  <Stage class="stage">
    <RenderLayer />
    <SearchLayer />
  </Stage>
  <SearchPanel />
  <NotesPanel bind:notes />
</div>
