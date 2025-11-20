<script lang="ts">
  import { type Position, restorePosition, type Size, transformSize } from '@embedpdf/models';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { createPointerProvider } from '../../shared/utils';
  import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

  interface PagePointerProviderProps extends HTMLAttributes<HTMLDivElement> {
    children: Snippet;
    pageIndex: number;
    pageWidth: number;
    pageHeight: number;
    rotation: number;
    scale: number;
    class?: string;
    convertEventToPoint?: (event: PointerEvent, element: HTMLElement) => Position;
  }

  let {
    pageIndex,
    children,
    pageWidth,
    pageHeight,
    rotation,
    scale,
    convertEventToPoint,
    class: propsClass,
    ...restProps
  }: PagePointerProviderProps = $props();

  let ref = $state<HTMLDivElement | null>(null);

  const interactionManagerCapability = useInteractionManagerCapability();
  const isPageExclusive = useIsPageExclusive();

  // Memoize the default conversion function
  const defaultConvertEventToPoint = $derived.by(() => {
    return (event: PointerEvent, element: HTMLElement): Position => {
      const rect = element.getBoundingClientRect();
      const displayPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const displaySize: Size = transformSize(
        { width: pageWidth, height: pageHeight },
        rotation,
        1,
      );

      return restorePosition(displaySize, displayPoint, rotation, scale);
    };
  });

  $effect(() => {
    if (!interactionManagerCapability.provides || !ref) return;

    return createPointerProvider(
      interactionManagerCapability.provides,
      { type: 'page', pageIndex },
      ref,
      convertEventToPoint || defaultConvertEventToPoint,
    );
  });
</script>

<div
  bind:this={ref}
  style:position="relative"
  style:width={`${pageWidth}px`}
  style:height={`${pageHeight}px`}
  class={propsClass}
  {...restProps}
>
  {@render children()}
  {#if isPageExclusive}
    <div
      style:position="absolute"
      style:top="0"
      style:left="0"
      style:right="0"
      style:bottom="0"
      style:z-index="10"
      style:pointer-events="none"
    ></div>
  {/if}
</div>
