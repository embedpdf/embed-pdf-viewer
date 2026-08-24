/** A browser image source whose object URL has an explicit lifetime. */
export interface ObjectUrlImageSource {
  objectUrl(signal?: AbortSignal): Promise<{ url: string; revoke(): void }>;
}

export interface PaintedImageCallbacks {
  onPainted(): void;
  onUnpainted(): void;
}

/**
 * Bind a raster source to an <img> without ever painting its incomplete-image
 * placeholder. The source becomes visible on load; retained coverage is
 * released only after the browser has had one full frame to present it.
 *
 * Call this from the framework's pre-paint mount hook and invoke the returned
 * cleanup on unmount. Keeping this DOM lifecycle here lets every framework
 * adapter remain a ref plus one bind/unbind hook.
 */
export function bindPaintedImage(
  image: HTMLImageElement,
  source: ObjectUrlImageSource,
  callbacks: PaintedImageCallbacks,
): () => void {
  const controller = new AbortController();
  let revoke: (() => void) | undefined;
  let frame = 0;
  let painted = false;

  // The element is already committed when a mount hook runs. Hide it before
  // that commit can paint, then reveal only once the bitmap has loaded.
  image.style.visibility = 'hidden';

  const onLoad = () => {
    image.style.visibility = 'visible';

    // rAF callbacks run before a frame paints. The first frame presents the
    // newly visible image while retained coverage remains; the second reports
    // that presentation opportunity and permits the retained source to leave.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        painted = true;
        callbacks.onPainted();
      });
    });
  };

  image.addEventListener('load', onLoad, { once: true });

  void source.objectUrl(controller.signal).then(
    (objectUrl) => {
      if (controller.signal.aborted) {
        objectUrl.revoke();
        return;
      }
      revoke = objectUrl.revoke;
      image.src = objectUrl.url;
    },
    () => {
      // Aborted or unavailable: remain hidden and retain fallback coverage.
    },
  );

  return () => {
    controller.abort();
    if (frame) cancelAnimationFrame(frame);
    image.removeEventListener('load', onLoad);
    image.style.visibility = 'hidden';
    image.removeAttribute('src');
    revoke?.();
    if (painted) callbacks.onUnpainted();
  };
}
