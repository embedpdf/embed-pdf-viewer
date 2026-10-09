/**
 * Object URLs for the pictures plugins hand out, with their lifetime. The
 * plugins hold bytes and image handles; a URL is a browser resource, made
 * here when a view shows the picture and revoked when it lets go:
 *
 * - {@link objectUrlOf}: bytes (a stamp's gallery preview) as a URL, now;
 * - {@link loadObjectUrl}: bytes still to load (the armed stamp's ghost);
 * - {@link loadAppearanceUrls}: a page's baked annotation appearances, and
 *   {@link bakedAppearanceOf}, one of them as a renderer's `appearance`;
 * - {@link loadFieldPictureUrls}: a page's form field pictures, every state,
 *   and {@link shownFieldPicture}, the one a widget shows.
 */
import type { ObjectUrlImageSource } from './painted-image';

/** Bytes and their type, as the stamp and annotation plugins hand out previews. */
export interface PictureBytes {
  readonly bytes: Uint8Array;
  readonly mimeType?: string | null;
}

/** An object URL, and how to release it. */
export interface ObjectUrl {
  readonly url: string;
  revoke(): void;
}

/** An object URL for bytes. Revoke it when nothing shows it any more. */
export function objectUrlOf(picture: PictureBytes): ObjectUrl {
  // Copy into an exact ArrayBuffer (the engine idiom): a Uint8Array view may
  // sit on a larger or shared buffer, which Blob won't accept.
  const body = new ArrayBuffer(picture.bytes.byteLength);
  new Uint8Array(body).set(picture.bytes);
  const blob = new Blob([body], picture.mimeType ? { type: picture.mimeType } : {});
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/**
 * Load a picture and hand its object URL to `onUrl` once it's there (nothing
 * for `null`). What it returns cancels: a load still running is dropped, and
 * the URL is revoked. Keep showing the previous URL until `onUrl` brings the
 * next one, so a swap never flickers.
 */
export function loadObjectUrl(
  load: () => Promise<PictureBytes | null>,
  onUrl: (url: string) => void,
): () => void {
  let cancelled = false;
  let made: ObjectUrl | null = null;
  void load().then((picture) => {
    if (cancelled || !picture) return;
    made = objectUrlOf(picture);
    onUrl(made.url);
  });
  return () => {
    cancelled = true;
    made?.revoke();
  };
}

/** One baked appearance as the annotation plugin renders it (`renderAppearances`). */
export interface AppearancePicture<Ref> {
  readonly ref: Ref;
  /** The box it was rendered into, in page points. */
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly image: ObjectUrlImageSource;
}

/** A baked appearance's URL, and the box it was rendered into. */
export interface AppearanceUrl {
  url: string;
  box: { x: number; y: number; width: number; height: number };
}

/**
 * The engine's picture of an annotation as a renderer gets it (its
 * `appearance`): `{ url }` once {@link loadAppearanceUrls} has loaded one for
 * the annotation's key (a render item's `id`), else `null`.
 */
export function bakedAppearanceOf(
  urls: Readonly<Record<string, AppearanceUrl>>,
  key: string,
): { url: string } | null {
  const baked = urls[key];
  return baked ? { url: baked.url } : null;
}

/**
 * Load a page's baked appearances and hand their URLs, by annotation key, to
 * `onLoaded`, once all of them are there. What it returns cancels: the load
 * is aborted, and every URL it made is revoked. Start it again when the
 * page's appearance epoch or the bake scale changes, never mid-gesture.
 */
export function loadAppearanceUrls<Ref>(
  load: (signal: AbortSignal) => Promise<readonly AppearancePicture<Ref>[]>,
  keyOf: (ref: Ref) => string,
  onLoaded: (urls: Record<string, AppearanceUrl>) => void,
): () => void {
  return loadPictureUrls(load, (picture) => keyOf(picture.ref), onLoaded);
}

/** One form field picture as the render plugin renders it: a widget in one of its states. */
export interface FieldPicture<Ref> extends AppearancePicture<Ref> {
  /** The state it draws (`/AS`), or `null` for a widget without states. */
  readonly state: string | null;
}

/** A field picture's key: its widget's key and the state it draws. */
const fieldPictureKey = (widgetKey: string, state: string | null): string =>
  `${widgetKey}|${state ?? ''}`;

/**
 * Load a page's form field pictures, every state of every widget, and hand
 * their URLs to `onLoaded` once all of them are there; {@link shownFieldPicture}
 * picks a widget's. A check box that changes shows its other picture at
 * once, before the next pictures arrive. Cancel like {@link loadAppearanceUrls}.
 */
export function loadFieldPictureUrls<Ref>(
  load: (signal: AbortSignal) => Promise<readonly FieldPicture<Ref>[]>,
  keyOf: (ref: Ref) => string,
  onLoaded: (urls: Record<string, AppearanceUrl>) => void,
): () => void {
  return loadPictureUrls(
    load,
    (picture) => fieldPictureKey(keyOf(picture.ref), picture.state),
    onLoaded,
  );
}

/**
 * The picture a widget shows, from {@link loadFieldPictureUrls}: the one of
 * the state it's in (`'Off'` when it names none), or its only picture when it
 * has no states; `null` until it's loaded.
 */
export function shownFieldPicture(
  urls: Readonly<Record<string, AppearanceUrl>>,
  widgetKey: string,
  appearanceState: string | null,
): AppearanceUrl | null {
  return (
    urls[fieldPictureKey(widgetKey, appearanceState ?? 'Off')] ??
    urls[fieldPictureKey(widgetKey, null)] ??
    null
  );
}

function loadPictureUrls<Picture extends AppearancePicture<unknown>>(
  load: (signal: AbortSignal) => Promise<readonly Picture[]>,
  keyOf: (picture: Picture) => string,
  onLoaded: (urls: Record<string, AppearanceUrl>) => void,
): () => void {
  const controller = new AbortController();
  const revokers: Array<() => void> = [];
  void (async () => {
    try {
      const pictures = await load(controller.signal);
      const urls: Record<string, AppearanceUrl> = {};
      for (const picture of pictures) {
        const made = await picture.image.objectUrl().abortWith(controller.signal);
        if (controller.signal.aborted) {
          made.revoke();
          return;
        }
        revokers.push(made.revoke);
        // Placed by its own rect (the box it was rendered into), never a recomputed bound.
        urls[keyOf(picture)] = { url: made.url, box: picture.rect };
      }
      if (!controller.signal.aborted) onLoaded(urls);
    } catch {
      // Aborted, or the page has no appearances to render.
    }
  })();
  return () => {
    controller.abort();
    revokers.forEach((revoke) => revoke());
  };
}
