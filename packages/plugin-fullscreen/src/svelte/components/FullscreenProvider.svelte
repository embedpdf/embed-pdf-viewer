<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { useFullscreenPlugin, useFullscreenCapability } from '../hooks';
  import { handleFullscreenRequest } from '../../shared/utils/fullscreen-utils';

  type FullscreenProviderProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    children: Snippet;
    class?: string;
    style?: string;
  };

  let {
    children,
    class: propsClass,
    style: propsStyle,
    ...restProps
  }: FullscreenProviderProps = $props();

  const fullscreenCapabilityState = useFullscreenCapability();
  const fullscreenPluginState = useFullscreenPlugin();

  let containerRef = $state<HTMLDivElement | null>(null);

  // Handle fullscreen requests
  $effect(() => {
    const capability = fullscreenCapabilityState.provides;
    const plugin = fullscreenPluginState.plugin;

    if (!capability || !plugin) return;

    const unsub = capability.onRequest(async (event) => {
      const targetSelector = plugin.getTargetSelector();
      await handleFullscreenRequest(event, containerRef, targetSelector);
    });

    return unsub;
  });

  // Listen for fullscreen changes
  $effect(() => {
    const plugin = fullscreenPluginState.plugin;

    if (!plugin) return;

    const handler = () => {
      plugin.setFullscreenState(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  });
</script>

<div
  {...restProps}
  bind:this={containerRef}
  style:position="relative"
  style:width="100%"
  style:height="100%"
  style={propsStyle}
  class={propsClass}
>
  {@render children()}
</div>
