import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/engine-core/runtime';

/** Shared fakes for kernel tests: an engine that opens immediately. */
const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
export const page = (pon: number, index: number): PageLayout =>
  ({
    index,
    ref: { kind: 'objectNumber', pageObjectNumber: pon },
    label: null,
    size: { width: 600, height: 800 },
    rotation: 0,
    userUnit: 1,
    boxes: { media: { ...box }, crop: { ...box } },
  }) as PageLayout;

export function makeHandle(id: string, pages: PageLayout[] = [page(1, 0)]): DocumentHandle {
  const listeners = new Set<(event: unknown) => void>();
  return {
    id,
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      emit: (event: unknown) => listeners.forEach((l) => l(event)),
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: pages.length, pages }) },
    security: { allows: () => true },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
}

export function immediateEngine(handles: Record<string, DocumentHandle> = {}): Engine {
  return {
    open: (input: { id?: string }) => {
      const id = input.id ?? 'doc';
      return Promise.resolve(handles[id] ?? makeHandle(id));
    },
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

export const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });
export const settle = () => new Promise((r) => setTimeout(r, 0));
