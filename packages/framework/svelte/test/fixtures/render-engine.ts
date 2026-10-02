/**
 * A fake engine for rendering: every document has `pageCount` pages, and every render resolves
 * at once to an image whose object URL names the page and the call (`blob:page-1-call-1`).
 */
import type { DocumentHandle, Engine, PageRef } from '@embedpdf/core';
import { pageAt } from './counter-plugin';

/** A promise with the `abort` / `abortWith` the engine's tasks have. */
function task<T>(value: T) {
  const promise = Promise.resolve(value);
  return Object.assign(promise, { abort: () => {}, abortWith: () => promise });
}

export function renderEngine(pageCount = 2) {
  const renders: { page: number; options: Record<string, unknown> }[] = [];
  const revoked: string[] = [];
  const pages = Array.from({ length: pageCount }, (_, index) => pageAt(index));
  const handle = {
    id: 'doc',
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount, pages }) },
    security: { allows: () => true, allowsAnnotation: () => true },
    render: { getPolicy: () => Promise.resolve({ kind: 'continuous' }) },
    page: (ref: PageRef) => ({
      render: {
        image: (options: Record<string, unknown>) => {
          renders.push({ page: ref.objectNumber, options });
          const url = `blob:page-${ref.objectNumber}-call-${renders.length}`;
          return task({
            objectUrl: () => task({ url, revoke: () => revoked.push(url) }),
          });
        },
      },
    }),
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: (input: { id?: string }) => Promise.resolve({ ...handle, id: input.id ?? 'doc' }),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  return { engine, renders, revoked };
}
