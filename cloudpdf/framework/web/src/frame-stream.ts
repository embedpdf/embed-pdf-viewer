/**
 * One video's stream of frames. A frame is a small file of its own: an init segment and one
 * fragment with a single keyframe at time 0, one second long. It's appended to the stream the
 * first time it's needed, at the stream's next free second, so frames of other sizes share one
 * stream and one license; showing a frame again is a seek.
 */

/** How long after a seek's end a frame is taken to be on screen, where the video says no more. */
const SETTLE_MS = 100;
/** How long to wait for a frame callback after the seek's end before learning there are none. */
const CALLBACK_WAIT_MS = 500;
/** The longest a frame is waited for: a hidden tab paints nothing, and says so. */
const GIVE_UP_MS = 4000;

export interface FrameStream {
  /**
   * The frame `key`'s second in the stream: fetched with `fetchFrame` and appended the first
   * time, one append at a time.
   */
  append(key: string, fetchFrame: () => Promise<ArrayBuffer>): Promise<number>;
  /** The second of frame `key`, appended, or `null`. */
  timeOf(key: string): number | null;
  /** Seek to the frame at `time`, resolving once it's on screen. */
  show(time: number): Promise<void>;
  /** Forget the frames whose key `stale` matches: they're made and appended again when needed. */
  forget(stale: (key: string) => boolean): void;
  close(): void;
}

// Media Source where there is one; ManagedMediaSource on the iPhone.
type MediaSourceConstructor = new () => MediaSource;
const MediaSourceType: MediaSourceConstructor | undefined =
  globalThis.MediaSource ??
  (globalThis as { ManagedMediaSource?: MediaSourceConstructor }).ManagedMediaSource;

export async function openStream(video: HTMLVideoElement, mime: string): Promise<FrameStream> {
  if (MediaSourceType === undefined) throw new Error('this browser has no Media Source');
  if (MediaSourceType !== globalThis.MediaSource) video.disableRemotePlayback = true; // ManagedMediaSource requires it
  const source = new MediaSourceType();
  const url = URL.createObjectURL(source);
  video.src = url;
  await once(source, 'sourceopen');
  const buffer = source.addSourceBuffer(mime);
  const slots = new Map<string, number>();
  let next = 0;
  let queue: Promise<unknown> = Promise.resolve();
  // Whether the video reports its frames (requestVideoFrameCallback), learned at the first seek.
  let callbacks: 'unknown' | 'yes' | 'no' = 'requestVideoFrameCallback' in video ? 'unknown' : 'no';

  return {
    append(key, fetchFrame) {
      const append = async () => {
        const kept = slots.get(key);
        if (kept !== undefined) return kept;
        const bytes = await fetchFrame();
        const time = next++;
        buffer.timestampOffset = time; // the frame's fragment starts at 0
        buffer.appendBuffer(bytes);
        await once(buffer, 'updateend');
        source.endOfStream(); // shows the last frame; the next append opens the stream again
        slots.set(key, time);
        return time;
      };
      const appended = queue.then(append, append);
      queue = appended.catch(() => {});
      return appended;
    },

    timeOf: (key) => slots.get(key) ?? null,

    show(time) {
      const target = time + 0.5;
      if (!video.seeking && Math.abs(video.currentTime - target) < 0.01) return Promise.resolve();
      return new Promise((resolve) => {
        let done = false;
        const giveUp = setTimeout(() => finish(), GIVE_UP_MS);
        function finish() {
          if (done) return;
          done = true;
          clearTimeout(giveUp);
          resolve();
        }
        // The frame's own callback says it's on screen: its media time is this frame's.
        const watch = () =>
          video.requestVideoFrameCallback((_, meta) => {
            callbacks = 'yes';
            if (meta.mediaTime >= time && meta.mediaTime < time + 1) finish();
            else if (!done) watch();
          });
        if (callbacks !== 'no') watch();
        video.addEventListener(
          'seeked',
          () => {
            // A video that reports no frames (Firefox's Widevine H.264): the seek's end, settled.
            if (callbacks === 'no') return void setTimeout(finish, SETTLE_MS);
            setTimeout(() => {
              if (done) return;
              if (callbacks === 'unknown') callbacks = 'no';
              finish();
            }, CALLBACK_WAIT_MS);
          },
          { once: true },
        );
        video.currentTime = target;
      });
    },

    forget(stale) {
      for (const key of [...slots.keys()]) if (stale(key)) slots.delete(key);
    },

    close() {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}

function once(target: EventTarget, type: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener('error', failed);
      resolve();
    };
    const failed = () => {
      target.removeEventListener(type, done);
      reject(new Error(`${type} failed`));
    };
    target.addEventListener(type, done, { once: true });
    target.addEventListener('error', failed, { once: true });
  });
}
