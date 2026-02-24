import { FullscreenRequestEvent } from '@embedpdf/plugin-fullscreen';

/**
 * Find the element to fullscreen based on the event and container
 * @param event The fullscreen request event
 * @param containerElement The container element (fallback if no selector or element not found)
 * @param targetSelector Optional target selector from plugin config
 * @returns The element to fullscreen, or null if not found
 */
export function findFullscreenElement(
  event: FullscreenRequestEvent,
  containerElement: HTMLElement | null,
  targetSelector?: string,
): HTMLElement | null {
  if (!containerElement || event.action !== 'enter') {
    return containerElement;
  }

  let elementToFullscreen: HTMLElement | null = null;

  if (targetSelector) {
    // Try to find the element within the wrapper element
    elementToFullscreen = containerElement.querySelector(targetSelector);
    if (!elementToFullscreen) {
      console.warn(
        `Fullscreen: Could not find element with selector "${targetSelector}" within the wrapper. Falling back to wrapper element.`,
      );
    }
  }

  // Fall back to the wrapper element if no selector or element not found
  if (!elementToFullscreen) {
    elementToFullscreen = containerElement;
  }

  return elementToFullscreen;
}

/**
 * Handle a fullscreen request event
 * @param event The fullscreen request event
 * @param containerElement The container element
 * @param targetSelector Optional target selector from plugin config
 */
export async function handleFullscreenRequest(
  event: FullscreenRequestEvent,
  containerElement: HTMLElement | null,
  targetSelector?: string,
): Promise<void> {
  if (event.action === 'enter') {
    const elementToFullscreen = findFullscreenElement(event, containerElement, targetSelector);

    if (elementToFullscreen && !document.fullscreenElement) {
      await elementToFullscreen.requestFullscreen();
    }
  } else {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }
}
