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
 *
 * A layer's pictures are loaded again whenever its page changes, and the set
 * it shows stays valid until the next one is shown ({@link createShownUrls}).
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
 * The URLs a layer shows, kept from one load to the next: a set stays valid
 * until the set after it is shown, so a picture that shows again before the
 * next set arrives (an annotation an undo brings back) still has a live URL.
 * One per layer, passed to every load; `release()` when the layer goes.
 */
export interface ShownUrls {
  /** Revoke the URLs shown now: the layer is going. A later load starts afresh. */
  release(): void;
}

/** The set of URLs a layer shows, and the one place it is replaced. */
interface ShownUrlsHolder extends ShownUrls {
  /** `revokers` are shown now: revoke the set before them. */
  replace(revokers: readonly (() => void)[]): void;
}

/** What a layer shows, for {@link loadAppearanceUrls} and {@link loadFieldPictureUrls}. */
export function createShownUrls(): ShownUrls {
  let shown: readonly (() => void)[] = [];
  const holder: ShownUrlsHolder = {
    replace(revokers) {
      const before = shown;
      shown = revokers;
      before.forEach((revoke) => revoke());
    },
    release: () => holder.replace([]),
  };
  return holder;
}

/**
 * Load a page's baked appearances and hand their URLs, by annotation key, to
 * `onLoaded`, once all of them are there; the set `shown` held before is
 * revoked then. What it returns cancels: the load is aborted and the URLs it
 * made are revoked, unless it already handed them over. Start it again when
 * the page's appearance epoch or the bake scale changes, never mid-gesture.
 */
export function loadAppearanceUrls<Ref>(
  shown: ShownUrls,
  load: (signal: AbortSignal) => Promise<readonly AppearancePicture<Ref>[]>,
  keyOf: (ref: Ref) => string,
  onLoaded: (urls: Record<string, AppearanceUrl>) => void,
): () => void {
  return loadPictureUrls(shown, load, (picture) => keyOf(picture.ref), onLoaded);
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
  shown: ShownUrls,
  load: (signal: AbortSignal) => Promise<readonly FieldPicture<Ref>[]>,
  keyOf: (ref: Ref) => string,
  onLoaded: (urls: Record<string, AppearanceUrl>) => void,
): () => void {
  return loadPictureUrls(
    shown,
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
  shown: ShownUrls,
  load: (signal: AbortSignal) => Promise<readonly Picture[]>,
  keyOf: (picture: Picture) => string,
  onLoaded: (urls: Record<string, AppearanceUrl>) => void,
): () => void {
  const controller = new AbortController();
  /** The URLs this load made and hasn't handed over. */
  let made: (() => void)[] = [];
  const drop = () => {
    made.forEach((revoke) => revoke());
    made = [];
  };
  const urlOf = async (picture: Picture) => {
    const url = await picture.image.objectUrl().abortWith(controller.signal);
    // Arrived after the load was dropped: nobody else will revoke it.
    if (controller.signal.aborted) {
      url.revoke();
      throw controller.signal.reason;
    }
    made.push(url.revoke);
    return url.url;
  };
  void (async () => {
    try {
      const pictures = await load(controller.signal);
      const minted = await Promise.all(pictures.map(urlOf));
      if (controller.signal.aborted) return;
      const urls: Record<string, AppearanceUrl> = {};
      // Placed by its own rect (the box it was rendered into), never a recomputed bound.
      pictures.forEach((picture, index) => {
        urls[keyOf(picture)] = { url: minted[index]!, box: picture.rect };
      });
      onLoaded(urls);
      (shown as ShownUrlsHolder).replace(made);
      made = [];
    } catch {
      // Aborted, or the page has no appearances to render: what is still on
      // its way is dropped with what was made.
      controller.abort();
      drop();
    }
  })();
  return () => {
    controller.abort();
    drop();
  };
}
