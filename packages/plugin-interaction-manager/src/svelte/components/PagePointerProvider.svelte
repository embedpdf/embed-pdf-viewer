<script lang="ts">
  import { type Position, restorePosition, transformSize } from '@embedpdf/models';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { createPointerProvider } from '../../shared/utils';
  import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

  interface PagePointerProviderProps extends HTMLAttributes<HTMLDivElement> {
    documentId: string;
    pageIndex: number;
    rotation?: number;
    scale?: number;
    children: Snippet;
    class?: string;
    convertEventToPoint?: (event: PointerEvent, element: HTMLElement) => Position;
  }

  let {
    documentId,
    pageIndex,
    children,
    rotation: rotationOverride,
    scale: scaleOverride,
    convertEventToPoint,
    class: propsClass,
    ...restProps
  }: PagePointerProviderProps = $props();

  let ref = $state<HTMLDivElement | null>(null);

  const { provides: cap } = useInteractionManagerCapability();
  const isPageExclusive = useIsPageExclusive(documentId);
  const documentState = useDocumentState(documentId);

  // Get page dimensions and transformations from document state
  const page = $derived(documentState.current?.document?.pages?.[pageIndex]);
  const naturalPageSize = $derived(page?.size ?? { width: 0, height: 0 });
  const rotation = $derived(rotationOverride ?? documentState.current?.rotation ?? 0);
  const scale = $derived(scaleOverride ?? documentState.current?.scale ?? 1);
  const displaySize = $derived(transformSize(naturalPageSize, 0, scale));

  // Default conversion function
  const defaultConvertEventToPoint = $derived.by(() => {
    return (event: PointerEvent, element: HTMLElement): Position => {
      const rect = element.getBoundingClientRect();
      const displayPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      // Get the rotated natural size (width/height may be swapped, but not scaled)
      const rotatedNaturalSize = transformSize(
        {
          width: displaySize.width,
          height: displaySize.height,
        },
        rotation,
        1,
      );

      return restorePosition(rotatedNaturalSize, displayPoint, rotation, scale);
    };
  });

  $effect(() => {
    if (!cap || !ref) return;

    return createPointerProvider(
      cap,
      { type: 'page', documentId, pageIndex },
      ref,
      convertEventToPoint || defaultConvertEventToPoint,
    );
  });
</script>

<div
  bind:this={ref}
  style:position="relative"
  style:width={`${displaySize.width}px`}
  style:height={`${displaySize.height}px`}
  class={propsClass}
  {...restProps}
>
  {@render children()}
  {#if isPageExclusive.current}
    <div
      style:position="absolute"
      style:top="0"
      style:left="0"
      style:right="0"
      style:bottom="0"
      style:z-index="10"
    ></div>
  {/if}
</div>
