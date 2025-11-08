<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useInteractionManagerCapability } from '../hooks';
  import { createPointerProvider } from '../../shared/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  interface GlobalPointerProviderProps extends HTMLAttributes<HTMLDivElement> {
    children: Snippet;
    class?: string;
  }

  let { children, class: propsClass, ...restProps }: GlobalPointerProviderProps = $props();

  let ref = $state<HTMLDivElement | null>(null);
  const interactionManagerCapability = useInteractionManagerCapability();

  $effect(() => {
    if (!interactionManagerCapability.provides || !ref) return;

    return createPointerProvider(interactionManagerCapability.provides, { type: 'global' }, ref);
  });
</script>

<div bind:this={ref} style:width="100%" style:height="100%" class={propsClass} {...restProps}>
  {@render children()}
</div>
