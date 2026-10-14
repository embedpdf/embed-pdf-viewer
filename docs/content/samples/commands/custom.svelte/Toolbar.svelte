<script lang="ts">
  import { onMount } from 'svelte';
  import { useCommands } from '@embedpdf/svelte/commands';
  import CategorySwitch from './CategorySwitch.svelte';
  import CommandButton from './CommandButton.svelte';

  const commands = useCommands();

  // Run from code: the document opens with its whole first page in view.
  onMount(() => {
    void commands.execute('zoom:fit-page');
  });
</script>

<div class="toolbar">
  <div class="buttons">
    <CommandButton id="zoom:out" />
    <CommandButton id="zoom:in" />
    <CommandButton id="zoom:fit-page" />
    <CommandButton id="layout:two-pages" />
  </div>
  <div class="switches">
    <CategorySwitch category="zoom" label="Zoom" />
    <CategorySwitch category="layout" label="Layout" />
  </div>
</div>
