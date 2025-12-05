<script lang="ts">
  import { onMount } from 'svelte';
  import { useCommandsCapability } from '../hooks';
  import { createKeyDownHandler } from '../../shared/utils';

  const commandsCapability = useCommandsCapability();

  onMount(() => {
    if (!commandsCapability.provides) return;

    const handleKeyDown = createKeyDownHandler(commandsCapability.provides);

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
</script>

<!-- This component is only used to set up keyboard shortcuts when the plugin is initialized. -->
