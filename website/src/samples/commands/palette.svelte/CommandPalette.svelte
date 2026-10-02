<script lang="ts">
  import { useCommands } from '@embedpdf/svelte/commands';
  import Result from './Result.svelte';

  const commands = useCommands();
  let query = $state('page');
  const results = $derived(commands.searchCommands(query));

  // Enter runs the first result that can run now.
  function runFirst(event: KeyboardEvent) {
    const first = results.find((command) => commands.canExecute(command.id));
    if (event.key === 'Enter' && first) void commands.execute(first.id);
  }
</script>

<div class="palette">
  <input
    class="field"
    type="search"
    aria-label="Search commands"
    placeholder="Type a command…"
    bind:value={query}
    onkeydown={runFirst}
  />
  <ul class="results">
    {#each results as command (command.id)}
      <Result id={command.id} />
    {/each}
    {#if results.length === 0}
      <li class="empty">No command matches</li>
    {/if}
  </ul>
</div>
