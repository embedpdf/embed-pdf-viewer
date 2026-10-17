/**
 * A running read gives way (the page residency plan, U3), on a real local
 * engine: a text-geometry warm-up of a page just off screen gives way to the
 * page the view lands on, and a search scan to the page a result jumps to.
 * Each still gets its answer after.
 */
import { describe, expect, test } from 'vitest';

import { createLocalEngine } from '../src/index';
import { heavyPdf } from './helpers/heavyPdf';

describe('a running read giving way (local engine)', () => {
  test("a near page's warm-up gives way to the landing page's render, and still gets its answer", async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open({ kind: 'bytes', id: 'preempt', bytes: heavyPdf(2, 60_000) });
      const [landing, near] = (await doc.pages.list()).pages.map((page) => page.ref);
      doc.setWorkingSet('stage', [
        { page: landing!, role: 'visible', pixels: 1_000_000 },
        { page: near!, role: 'near', pixels: 0 },
      ]);
      const order: string[] = [];

      // Nothing else waits, so the warm-up starts parsing its page at once.
      const warmUp = doc
        .page(near!)
        .text.layout()
        .then(() => void order.push('warm-up of the near page'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      const render = doc
        .with({ view: 'stage' })
        .page(landing!)
        .render.raw({ viewport: { kind: 'scale', scale: 0.25 } })
        .then(() => void order.push('render of the landing page'));
      await Promise.all([warmUp, render]);

      expect(order).toEqual(['render of the landing page', 'warm-up of the near page']);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  }, 120_000);

  test('a running search gives way to the page a result jumps to, and continues after it', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open({ kind: 'bytes', id: 'search', bytes: heavyPdf(4, 60_000) });
      const pages = (await doc.pages.list()).pages.map((page) => page.ref);
      const order: string[] = [];

      // A search scan parses page after page: background work.
      const search = doc
        .with({ priority: 'low' })
        .search.query({ text: 'nowhere' })
        .then(() => void order.push('search slice'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      // A result was clicked: the view jumps to the last page, and its layers ask for its text.
      doc.setWorkingSet('stage', [{ page: pages[3]!, role: 'visible', pixels: 1_000_000 }]);
      const geometry = doc
        .page(pages[3]!)
        .text.layout()
        .then(() => void order.push('geometry of the page'));
      await Promise.all([search, geometry]);

      expect(order).toEqual(['geometry of the page', 'search slice']);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  }, 120_000);
});
