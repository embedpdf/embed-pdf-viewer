import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);

const TENANT_ID = 'cloud-view-sharing-tenant';
const DOC_ID = 'view-sharing-doc';

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-view-sharing-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

/** Open a handle on one visitor's layer, the layer-per-visitor shape. */
async function openLayer(layer: string) {
  const engine = createCloudEngine({
    baseUrl: fx!.baseUrl,
    token: docScopedToken(fx!, TENANT_ID, DOC_ID, ['*'], layer),
  });
  const doc = await engine.open({ kind: 'id', id: DOC_ID, layerName: layer });
  return { engine, doc };
}

const urlOf = (h: { source: { kind: string; url?: string } }) =>
  h.source.kind === 'url' ? h.source.url! : '';

describe('plane-scoped view sharing (cloud SDK, real runtime)', () => {
  test('pristine layers share EVERY plane — the base HAS annotations and they are visible', async () => {
    const alice = await openLayer('alice');
    const bob = await openLayer('bob');
    try {
      const pon = (await alice.doc.pages.list()).pages[0]!.pageObjectNumber;

      // Annotation-free renders: one doc-level URL for both visitors.
      const [a, b] = await Promise.all([
        alice.doc.page(pon).render.image({ includeAnnotations: false }),
        bob.doc.page(pon).render.image({ includeAnnotations: false }),
      ]);
      expect(urlOf(a)).toBe(urlOf(b));
      expect(urlOf(a)).toContain(`/v1/docs/${DOC_ID}/render/pages/${pon}/data@`);
      expect(urlOf(a)).not.toContain('/layers/');
      expect((await a.objectUrl()).url).toBeTruthy();

      // ANNOTATED renders share too — this base carries real annotations
      // and a pristine layer's annotation view IS the base's (the axiom the
      // first cut got wrong). Own path family: /render/annotated/.
      const [aa, ba] = await Promise.all([
        alice.doc.page(pon).render.image({ includeAnnotations: true }),
        bob.doc.page(pon).render.image({ includeAnnotations: true }),
      ]);
      expect(urlOf(aa)).toBe(urlOf(ba));
      expect(urlOf(aa)).toContain(`/v1/docs/${DOC_ID}/render/annotated/pages/${pon}/data@`);
      expect(urlOf(aa)).not.toContain('/layers/');
      expect((await aa.objectUrl()).url).toBeTruthy();

      // The annotation LIST is the base's list — non-empty, identical
      // across visitors, served from the shared doc-level URL (a wrong
      // path family would 404 through the real runtime here). Weak-identity
      // annotations ride along untouched.
      const [listA, listB] = await Promise.all([
        alice.doc.page(pon).annotations.list(),
        bob.doc.page(pon).annotations.list(),
      ]);
      expect(listA.annotations.length).toBeGreaterThan(0);
      expect(listA.annotations).toEqual(listB.annotations);

      // Attachments plane: shared listing (empty for this fixture, but the
      // path family must resolve).
      expect(await alice.doc.attachments.list()).toEqual(await bob.doc.attachments.list());
    } finally {
      await alice.doc.close();
      await bob.doc.close();
      await alice.engine.destroy();
      await bob.engine.destroy();
    }
  });

  test('LIVE handle: an annotation write flips ONLY the annotations plane (no reopen)', async () => {
    const carol = await openLayer('carol');
    const dave = await openLayer('dave');
    try {
      const pon = (await carol.doc.pages.list()).pages[0]!.pageObjectNumber;
      const page = carol.doc.page(pon);

      // Pre-write: everything doc-level, including an annotated handle we
      // deliberately KEEP to prove the blob rail self-heals after the flip.
      const preAnnotated = await page.render.image({ includeAnnotations: true });
      expect(urlOf(preAnnotated)).toContain('/render/annotated/');

      const created = await page.annotations.create({
        subtype: 'highlight',
        contents: 'view-sharing: carol diverges',
        color: { r: 200, g: 100, b: 50 },
        opacity: 0.5,
        quadPoints: [
          {
            p1: { x: 50, y: 100 },
            p2: { x: 150, y: 100 },
            p3: { x: 50, y: 80 },
            p4: { x: 150, y: 80 },
          },
        ],
      });
      expect(created.created).toBeTruthy();

      // SAME handle, no reopen — the monotone flip did its job:
      // content-plane reads STILL resolve doc-level (the first cut's
      // delta-drops-scope bug made these fall back to layer paths)…
      const free = await page.render.image({ includeAnnotations: false });
      expect(urlOf(free)).toContain(`/v1/docs/${DOC_ID}/render/pages/${pon}/data@`);
      expect(urlOf(free)).not.toContain('/layers/');
      expect((await free.objectUrl()).url).toBeTruthy();

      // …while annotation-plane reads flipped to carol's own layer view,
      // which contains the base annotations PLUS her new one.
      const annotated = await page.render.image({ includeAnnotations: true });
      expect(urlOf(annotated)).toContain('/layers/carol/');
      const list = await page.annotations.list();
      expect(list.annotations.some((x) => x.contents === 'view-sharing: carol diverges')).toBe(
        true,
      );

      // The PRE-write annotated handle self-heals through the blob rail:
      // its remembered URL is stale (old family, old annotationVersion),
      // but blob() re-resolves via the manifest and serves.
      expect((await preAnnotated.objectUrl()).url).toBeTruthy();

      // Dave's pristine layer is untouched: still fully shared.
      const daveAnnotated = await dave.doc.page(pon).render.image({ includeAnnotations: true });
      expect(urlOf(daveAnnotated)).toContain('/render/annotated/');
      expect(urlOf(daveAnnotated)).not.toContain('/layers/');
    } finally {
      await carol.doc.close();
      await dave.doc.close();
      await carol.engine.destroy();
      await dave.engine.destroy();
    }
  });

  test('LIVE handle: rotate owns LAYOUT only — normalized renders keep sharing', async () => {
    const erin = await openLayer('erin');
    try {
      const pon = (await erin.doc.pages.list()).pages[0]!.pageObjectNumber;
      await erin.doc.pages.rotate([pon], 90);

      // SAME handle: rotation flipped layout, not content — the
      // annotation-free render STILL rides the shared doc-level URL (the
      // first cut flipped content on any layoutVersion bump, contradicting
      // its own normalized-artifact model).
      const free = await erin.doc.page(pon).render.image({ includeAnnotations: false });
      expect(urlOf(free)).toContain(`/v1/docs/${DOC_ID}/render/pages/${pon}/data@`);
      expect(urlOf(free)).not.toContain('/layers/');
      expect((await free.objectUrl()).url).toBeTruthy();

      // The layout leaf itself is layer-scoped now — list() must re-route
      // and still serve (rotation visible in the snapshot).
      const layout = await erin.doc.pages.list();
      expect(layout.pages.find((p) => p.pageObjectNumber === pon)?.rotation).toBe(90);
    } finally {
      await erin.doc.close();
      await erin.engine.destroy();
    }
  });
});
