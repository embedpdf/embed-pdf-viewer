<script lang="ts">
  import { usePinch } from '../hooks';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type PinchWrapperProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
    children: Snippet;
    class?: string;
  };

  let { children, class: propsClass, ...restProps }: PinchWrapperProps = $props();
  const pinch = usePinch();
</script>

<div
  bind:this={pinch.elementRef}
  {...restProps}
  style:display="block"
  style:width="fit-content"
  style:overflow="visible"
  style:box-sizing="border-box"
  style:margin="0px auto"
  class={propsClass}
>
  {children}
</div>
