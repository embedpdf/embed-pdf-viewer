<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useFullscreenPlugin, useFullscreenCapability } from '../hooks';

  interface Props {
    children: Snippet;
    class?: string;
    style?: string;
  }

  const { children, class: className, style }: Props = $props();

  const fullscreenCapability = useFullscreenCapability();
  const fullscreenPlugin = useFullscreenPlugin();

  let containerElement: HTMLDivElement | undefined;

  // Handle fullscreen requests
  $effect(() => {
    if (!fullscreenCapability.provides) return;

    const unsub = fullscreenCapability.provides.onRequest(async (action) => {
      if (action === 'enter') {
        const el = containerElement;
        if (el && !document.fullscreenElement) {
          await el.requestFullscreen();
        }
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      }
    });

    return unsub;
  });

  // Listen for fullscreen changes
  $effect(() => {
    if (!fullscreenPlugin.plugin) return;

    const handler = () => {
      fullscreenPlugin.plugin.setFullscreenState(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  });
</script>

<div
  bind:this={containerElement}
  class={className}
  style="position: relative; width: 100%; height: 100%; {style || ''}"
>
  {@render children()}
</div>
