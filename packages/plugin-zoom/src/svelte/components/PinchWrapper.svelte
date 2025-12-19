<script lang="ts">
  import { usePinch } from '../hooks';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type PinchWrapperProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    documentId: string;
    children: Snippet;
    class?: string;
  };

  let { documentId, children, class: propsClass, ...restProps }: PinchWrapperProps = $props();
  const pinch = usePinch(() => documentId);
</script>

<div
  bind:this={pinch.elementRef}
  {...restProps}
  style:display="inline-block"
  style:overflow="visible"
  style:box-sizing="border-box"
  class={propsClass}
>
  {@render children()}
</div>
