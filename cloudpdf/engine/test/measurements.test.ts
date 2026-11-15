import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runMeasurementConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { EngineErrorCode, measureFromKnownLength } from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import { auditRowToEvents } from '../src/realtime/auditRowToEvents';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};
const tenant = 'measurement-conformance',
  id = 'measurements';
let fx: DbSeededFixture;
beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'measurement-conformance-secret' });
  await seedDocumentFromBytes(
    fx,
    tenant,
    id,
    fileURLToPath(
      new URL('../../../examples/engine-runtime-demo/public/annotations.pdf', import.meta.url),
    ),
    1,
  );
});
afterAll(async () => {
  await teardownDbSeededFixture(fx);
});
const makeEngine = (scope: string[] = ['*']) =>
  cloudEngine({ baseUrl: fx.baseUrl, token: docScopedToken(fx, tenant, id, scope) });
runMeasurementConformance(runner, {
  label: 'cloud HTTP / native',
  openKind: 'id',
  fixture: { id, bytes: () => new Uint8Array(), expected: {} },
  makeEngine,
});

test('calibration persists an artifact and audit payload without bumping page cache counters', async () => {
  const engine = makeEngine(),
    doc = await engine.open({ kind: 'id', id });
  try {
    const ref = (await doc.pages.list()).pages[0].ref;
    const page = doc.page(ref);
    await page.measure!.setScale(measureFromKnownLength(100, { value: 3, unit: 'm' }));
    const before = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', id)
      .executeTakeFirstOrThrow();
    const pages = await fx.db
      .selectFrom('layer_pages')
      .selectAll()
      .where('layer_id', '=', before.id)
      .execute();
    await page.measure!.setScale(measureFromKnownLength(100, { value: 6, unit: 'm' }));
    const after = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('id', '=', before.id)
      .executeTakeFirstOrThrow();
    expect(after.doc_version).toBe(Number(before.doc_version) + 1);
    expect(after.current_version).toBe(Number(before.current_version) + 1);
    expect(after.current_artifact_key).not.toBe(before.current_artifact_key);
    expect(after.layout_version).toBe(before.layout_version);
    // The layout carries the scales: their own pin moves, and only it.
    expect(after.viewports_version).toBe(Number(before.viewports_version) + 1);
    expect(after.annotations_version).toBe(before.annotations_version);
    expect(
      await fx.db.selectFrom('layer_pages').selectAll().where('layer_id', '=', before.id).execute(),
    ).toEqual(pages);
    // Discard the live worker session: the next read must load the saved artifact.
    fx.bundle.documentService!.invalidateLayerSession(id, 'default');
    expect((await page.measure!.listViewports()).viewports.find((v) => v.owned)).toMatchObject({
      measure: { x: [{ conversion: Math.fround(0.06) }] },
    });
    // A scale is a change: its row tells another session the scale and the new layout.
    const row = await fx.db
      .selectFrom('audit_log')
      .selectAll()
      .where('kind', '=', 'change')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    const [event] = auditRowToEvents(
      // A row of this version: it reads as its events.
      {
        id: Number(row.id),
        ts: row.ts,
        sub: row.sub,
        kind: row.kind,
        pageObjectNumber: null,
        affectedPages: [],
        originSessionId: null,
        payload: JSON.parse(row.payload_json),
      },
      'another-session',
    )!;
    expect(event).toMatchObject({
      type: 'pages.scaleSet',
      page: ref,
      pages: [ref],
      measure: { x: [{ conversion: Math.fround(0.06) }] },
      meta: { affectedPages: [] },
    });
    expect(event?.type === 'pages.scaleSet' && event.layout.pages[0].viewports).toEqual(
      (await page.measure!.listViewports()).viewports,
    );
  } finally {
    await doc.close();
    await engine.destroy();
  }
});

test('a scale reaches every client through the layout, at its new pin', async () => {
  const engine = makeEngine(),
    doc = await engine.open({ kind: 'id', id });
  const other = await makeEngine().open({ kind: 'id', id });
  try {
    const ref = (await doc.pages.list()).pages[0].ref;
    const { layout } = await doc.pages.setScale(
      [ref],
      measureFromKnownLength(72, { value: 5, unit: 'm' }),
    );
    const own = layout.pages[0].viewports?.find((viewport) => viewport.owned);
    expect(own?.measure).toMatchObject({ subtype: 'rectilinear' });
    expect((await doc.pages.list()).pages[0].viewports).toEqual(layout.pages[0].viewports);
    // Another session reads the layout at the manifest's new scales pin.
    expect((await other.pages.list()).pages[0].viewports).toEqual(layout.pages[0].viewports);
  } finally {
    await other.close();
    await doc.close();
  }
});

test('read-only access can inspect calibration but cannot change it', async () => {
  const engine = makeEngine(['doc.open']),
    doc = await engine.open({ kind: 'id', id });
  try {
    const page = doc.page((await doc.pages.list()).pages[0].ref);
    const before = await page.measure!.listViewports();
    await expect(page.measure!.setScale(null)).rejects.toMatchObject({
      code: EngineErrorCode.Forbidden,
    });
    expect(await page.measure!.listViewports()).toEqual(before);
  } finally {
    await doc.close();
    await engine.destroy();
  }
});
