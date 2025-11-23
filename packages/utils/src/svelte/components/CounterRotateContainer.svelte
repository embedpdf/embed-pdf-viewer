<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getCounterRotation } from '@embedpdf/utils';
  import type { Rect, Rotation } from '@embedpdf/models';
  import type { MenuWrapperProps } from './types';

  interface CounterRotateProps {
    rect: Rect;
    rotation: Rotation;
  }

  interface CounterRotateChildrenProps {
    matrix: string;
    rect: Rect;
    menuWrapperProps: MenuWrapperProps;
  }

  interface Props extends CounterRotateProps {
    children?: Snippet<[CounterRotateChildrenProps]>;
  }

  let { rect, rotation, children }: Props = $props();
  const counterRotation = $derived(getCounterRotation(rect, rotation));
  let elementRef = $state<HTMLElement | null>(null);

  // Use native event listeners with capture phase to prevent event propagation
  $effect(() => {
    const element = elementRef;
    if (!element) return;

    const handlePointerDown = (e: Event) => {
      // Stop propagation to prevent underlying layers from receiving the event
      e.stopPropagation();
      // DO NOT use e.preventDefault() here - it breaks click events on mobile/tablet!
      // preventDefault() stops the browser from generating click events from touch,
      // which makes buttons inside this container non-functional on touch devices.
    };

    const handleTouchStart = (e: Event) => {
      // Stop propagation to prevent underlying layers from receiving the event
      e.stopPropagation();
      // DO NOT use e.preventDefault() here - it breaks click events on mobile/tablet!
      // preventDefault() stops the browser from generating click events from touch,
      // which makes buttons inside this container non-functional on touch devices.
    };

    // Use capture phase to intercept before synthetic events
    element.addEventListener('pointerdown', handlePointerDown, { capture: true });
    element.addEventListener('touchstart', handleTouchStart, { capture: true });

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      element.removeEventListener('touchstart', handleTouchStart, { capture: true });
    };
  });

  const menuWrapperStyle = $derived({
    position: 'absolute',
    left: `${rect.origin.x}px`,
    top: `${rect.origin.y}px`,
    transform: counterRotation.matrix,
    transformOrigin: '0 0',
    width: `${counterRotation.width}px`,
    height: `${counterRotation.height}px`,
    pointerEvents: 'none',
    zIndex: '3',
  });

  const menuWrapperProps: MenuWrapperProps = $derived({
    style: menuWrapperStyle,
    ref: (el: HTMLElement | null) => {
      elementRef = el;
    },
  });
</script>

{#if children}
  {@render children({
    menuWrapperProps,
    matrix: counterRotation.matrix,
    rect: {
      origin: { x: rect.origin.x, y: rect.origin.y },
      size: { width: counterRotation.width, height: counterRotation.height },
    },
  })}
{/if}
