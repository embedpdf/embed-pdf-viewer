<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { useInteractionManagerCapability } from '../hooks';
  import { createPointerProvider } from '../../shared/utils';

  interface GlobalPointerProviderProps extends HTMLAttributes<HTMLDivElement> {
    documentId: string;
    children: Snippet;
    class?: string;
  }

  let {
    documentId,
    children,
    class: propsClass,
    ...restProps
  }: GlobalPointerProviderProps = $props();

  let ref = $state<HTMLDivElement | null>(null);
  const interactionManagerCapability = useInteractionManagerCapability();

  $effect(() => {
    if (!interactionManagerCapability.provides || !ref) return;

    return createPointerProvider(
      interactionManagerCapability.provides,
      { type: 'global', documentId },
      ref,
    );
  });
</script>

<div bind:this={ref} style:width="100%" style:height="100%" class={propsClass} {...restProps}>
  {@render children()}
</div>
