<script lang="ts">
import type { Snippet } from "svelte";
import {getCounterRotation} from "@embedpdf/utils";
import type {Rect, Rotation} from "@embedpdf/models";

interface CounterRotateProps {
    rect: Rect;
    rotation: Rotation;
}

interface MenuWrapperProps {
    style: Record<string, string | number>;
    ref: (el: HTMLDivElement | null) => void;
}

interface $$Props extends CounterRotateProps {
    children?: Snippet<[{
        matrix: string;
        rect: Rect;
        menuWrapperProps: MenuWrapperProps;
    }]>;
}


let { rect, rotation, children } = $props();
const { matrix, width, height } = getCounterRotation(rect, rotation);
let elementRef = $state<HTMLDivElement | null>(null);

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

const menuWrapperStyle = {
    position: 'absolute',
    left: rect.origin.x,
    top: rect.origin.y,
    transform: matrix,
    transformOrigin: '0 0',
    width: width,
    height: height,
    pointerEvents: 'none',
    zIndex: 3,
};

const menuWrapperProps: MenuWrapperProps = {
    style: menuWrapperStyle,
    ref: (el: HTMLDivElement | null) => {
        elementRef = el;
    },
};

</script>


    {@render children({
    menuWrapperProps,
    matrix,
    rect: {
    origin: { x: rect.origin.x, y: rect.origin.y },
    size: { width: width, height: height },
},
})}



