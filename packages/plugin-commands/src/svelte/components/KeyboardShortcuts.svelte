<script lang="ts">
  import { onMount } from 'svelte';
  import { useCommandsCapability } from '../hooks';
  import { createKeyDownHandler } from '../../shared/utils';

  const { provides: commands } = useCommandsCapability();

  onMount(() => {
    if (!commands) return;

    const handleKeyDown = createKeyDownHandler(commands);

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
</script>

<!-- This component is only used to set up keyboard shortcuts when the plugin is initialized. -->
