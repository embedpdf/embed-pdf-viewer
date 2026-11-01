/**
 * A browser image source whose object URL has an explicit lifetime: an
 * engine `PageImageHandle`, whose `objectUrl()` is cancellable and follows an
 * `AbortSignal` through `abortWith()`.
 */
export interface ObjectUrlImageSource {
  objectUrl(): {
    abortWith(signal: AbortSignal): PromiseLike<{ url: string; revoke(): void }>;
  };
}

export interface PaintedImageCallbacks {
  onPainted(): void;
  onUnpainted(): void;
}

/**
 * Run `run` once the browser has had a frame to present what's visible now. rAF callbacks run
 * before a frame paints: the first frame presents it, and the second's callback runs after that
 * presentation opportunity. Returns the cancel.
 */
export function afterPresented(run: () => void): () => void {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      frame = 0;
      run();
    });
  });
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}

/**
 * Run `run` once `image` has presented the next picture it loads, after a frame to present it;
 * once, however often its `src` changes after that. A picture it holds already doesn't count: a
 * layer that shows another page in the same element still holds the last page's. A page layer's
 * base picture reports its page `shown()` this way. Returns the cancel.
 */
export function whenPresented(image: HTMLImageElement, run: () => void): () => void {
  let cancelFrames: (() => void) | undefined;
  const onLoad = () => {
    image.removeEventListener('load', onLoad);
    cancelFrames = afterPresented(run);
  };
  image.addEventListener('load', onLoad);
  return () => {
    image.removeEventListener('load', onLoad);
    cancelFrames?.();
  };
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
  let cancelFrames: (() => void) | undefined;
  let painted = false;

  // The element is already committed when a mount hook runs. Hide it before
  // that commit can paint, then reveal only once the bitmap has loaded.
  image.style.visibility = 'hidden';

  const onLoad = () => {
    image.style.visibility = 'visible';

    // The first frame presents the newly visible image while retained coverage
    // remains; after it, the retained source may leave.
    cancelFrames = afterPresented(() => {
      painted = true;
      callbacks.onPainted();
    });
  };

  image.addEventListener('load', onLoad, { once: true });

  void source
    .objectUrl()
    .abortWith(controller.signal)
    .then(
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
    cancelFrames?.();
    image.removeEventListener('load', onLoad);
    image.style.visibility = 'hidden';
    image.removeAttribute('src');
    revoke?.();
    if (painted) callbacks.onUnpainted();
  };
}
