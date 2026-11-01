/**
 * The protected display player's screen: one box with two videos, each with its own stream of
 * frames and keys from the same viewing session. The page video fills the box; the sharp video
 * sits over it where the plugin places it. The box moves into the box the page layer lent, so
 * the videos fill the page's content box, which the stage turns with the page.
 */
import { openStream, type FrameStream } from './frame-stream';
import { FRAME_MIME, videoKeysOf } from './protected-keys';
import type {
  WebFrameCodec,
  WebFrameLayer,
  WebKeySystemName,
  WebProtectedKeys,
  WebProtectedScreen,
} from './protected-player';

export async function openScreen(
  keySystem: WebKeySystemName,
  access: MediaKeySystemAccess,
  codec: WebFrameCodec,
  keys: WebProtectedKeys,
): Promise<WebProtectedScreen> {
  const videoKeys = videoKeysOf(keySystem, access, keys);
  const box = document.createElement('div');
  box.style.cssText = 'position: absolute; inset: 0; pointer-events: none';
  const pageVideo = newVideo();
  const sharpVideo = newVideo();
  box.append(pageVideo, sharpVideo);
  const streams: FrameStream[] = [];
  try {
    await videoKeys.attach(sharpVideo, await videoKeys.attach(pageVideo));
    streams.push(await openStream(pageVideo, FRAME_MIME[codec]));
    streams.push(await openStream(sharpVideo, FRAME_MIME[codec]));
  } catch (error) {
    for (const stream of streams) stream.close();
    videoKeys.close();
    throw error;
  }
  const [pageStream, sharpStream] = streams;

  return {
    mount(host) {
      if (host === null) box.remove();
      else if (box.parentElement !== host) host.append(box);
    },
    page: layerOf(pageVideo, pageStream),
    sharp: layerOf(sharpVideo, sharpStream),
    close() {
      box.remove();
      for (const stream of streams) stream.close();
      videoKeys.close();
    },
  };
}

function layerOf(video: HTMLVideoElement, stream: FrameStream): WebFrameLayer {
  // Moves on at every hide() and show(): a frame that reaches the screen after another call
  // doesn't show the video.
  let calls = 0;
  return {
    async load(key, frame) {
      await stream.append(key, frame);
    },

    async show(key) {
      const mine = ++calls;
      const time = stream.timeOf(key);
      if (time === null) throw new Error(`the frame ${key} was shown before it was loaded`);
      await stream.show(time);
      if (mine === calls) video.style.opacity = '';
    },

    hide() {
      calls++;
      video.style.opacity = '0';
    },

    place(rect) {
      Object.assign(
        video.style,
        rect === null
          ? { left: '0', top: '0', width: '100%', height: '100%' }
          : {
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
            },
      );
    },

    /**
     * Draw the frame again: a seek inside the frame's second, since a seek to the exact time
     * it's at is skipped. Nothing while it seeks, or before it drew anything.
     */
    redraw() {
      if (video.seeking || video.readyState < 2) return;
      const second = Math.floor(video.currentTime);
      const atFrame = Math.abs(video.currentTime - (second + 0.5)) < 0.0005;
      video.currentTime = atFrame ? second + 0.501 : second + 0.5;
    },

    forget(stale) {
      stream.forget(stale);
    },
  };
}

function newVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  // Nothing on a video fades, clips or filters it while it shows: those can take it off the
  // screen's protected layer. Hidden until a frame of it is on screen.
  video.style.cssText =
    'position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; object-fit: fill; opacity: 0';
  return video;
}
