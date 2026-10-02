<!-- 'page:go-to', a command of your own: it opens a small "Go to page" form. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useCommands } from '@embedpdf/svelte/commands';
  import PageNumber from './PageNumber.svelte';

  const commands = useCommands();
  let open = $state(false);

  onMount(() =>
    commands.registerCommand({
      id: 'page:go-to',
      label: 'Go to page…',
      run: () => {
        open = true;
      },
    }),
  );
</script>

{#if open}
  <div class="go-to" role="dialog" aria-label="Go to page">
    <PageNumber compact={false} />
    <button type="button" class="button" onclick={() => (open = false)}>Done</button>
  </div>
{/if}
