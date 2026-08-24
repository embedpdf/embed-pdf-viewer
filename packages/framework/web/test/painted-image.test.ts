import { describe, expect, it, vi } from 'vitest';

import { bindPaintedImage } from '../src/painted-image';

class FakeImage {
  src = '';
  style = { visibility: '' };
  private readonly listeners = new Map<string, EventListener>();

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }

  load(): void {
    this.listeners.get('load')?.(new Event('load'));
  }
}

function frameHarness() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));

  return {
    flush() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) callback(0);
    },
    pending: () => callbacks.size,
  };
}

describe('bindPaintedImage', () => {
  it('hides an incomplete image and reports painted after a presentation frame', async () => {
    const frames = frameHarness();
    const image = new FakeImage();
    const revoke = vi.fn();
    const onPainted = vi.fn();
    const onUnpainted = vi.fn();

    const cleanup = bindPaintedImage(
      image as unknown as HTMLImageElement,
      { objectUrl: async () => ({ url: 'blob:tile', revoke }) },
      { onPainted, onUnpainted },
    );

    expect(image.style.visibility).toBe('hidden');
    await Promise.resolve();
    expect(image.src).toBe('blob:tile');

    image.load();
    expect(image.style.visibility).toBe('visible');
    expect(onPainted).not.toHaveBeenCalled();

    frames.flush();
    expect(onPainted).not.toHaveBeenCalled();
    frames.flush();
    expect(onPainted).toHaveBeenCalledOnce();

    cleanup();
    expect(image.style.visibility).toBe('hidden');
    expect(image.src).toBe('');
    expect(revoke).toHaveBeenCalledOnce();
    expect(onUnpainted).toHaveBeenCalledOnce();
  });

  it('cancels a pending report and does not invert one that never painted', async () => {
    const frames = frameHarness();
    const image = new FakeImage();
    const revoke = vi.fn();
    const onPainted = vi.fn();
    const onUnpainted = vi.fn();

    const cleanup = bindPaintedImage(
      image as unknown as HTMLImageElement,
      { objectUrl: async () => ({ url: 'blob:tile', revoke }) },
      { onPainted, onUnpainted },
    );

    await Promise.resolve();
    image.load();
    expect(frames.pending()).toBe(1);

    cleanup();
    frames.flush();
    frames.flush();

    expect(onPainted).not.toHaveBeenCalled();
    expect(onUnpainted).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('revokes an object URL that resolves after cleanup', async () => {
    frameHarness();
    const image = new FakeImage();
    const revoke = vi.fn();
    let resolveUrl!: (value: { url: string; revoke(): void }) => void;
    const objectUrl = new Promise<{ url: string; revoke(): void }>((resolve) => {
      resolveUrl = resolve;
    });

    const cleanup = bindPaintedImage(
      image as unknown as HTMLImageElement,
      { objectUrl: () => objectUrl },
      { onPainted: vi.fn(), onUnpainted: vi.fn() },
    );

    cleanup();
    resolveUrl({ url: 'blob:late', revoke });
    await Promise.resolve();
    await Promise.resolve();

    expect(image.src).toBe('');
    expect(revoke).toHaveBeenCalledOnce();
  });
});
