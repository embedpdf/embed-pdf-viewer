import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  buildApp,
  createSqliteDb,
  EventLogService,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'layer-mutations-secret';
const NO_STORE = 'private, no-store';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

describe('Phase 5 layer mutation pipeline', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await buildFixture();
  });

  afterEach(async () => {
    await tearDown(fx);
  });

  test('first annotation create lazily creates layer, saves artifact, and bumps annotation version', async () => {
    const tenantId = 'tenant-layer-mut';
    const docId = 'doclayermut001';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(highlightDraft()),
      },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    const body = (await res.json()) as {
      meta: {
        cacheDelta: {
          previousDocVersion: number;
          docVersion: number;
          pages: Array<{
            pageObjectNumber: number;
            cache: {
              annotationVersion: number;
              contentVersion: number;
            };
          }>;
        };
        affectedPages: Array<{ pageObjectNumber: number; revision: { generation: number } }>;
      };
    };
    expect(body.meta.affectedPages[0]?.pageObjectNumber).toBe(1);
    expect(body.meta.affectedPages[0]?.revision.generation).toBe(0);
    expect(body.meta.cacheDelta).toMatchObject({
      previousDocVersion: 1,
      docVersion: 2,
      pages: [{ pageObjectNumber: 1, cache: { annotationVersion: 2, contentVersion: 1 } }],
    });

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(1);
    expect(layer.doc_version).toBe(2);
    expectAttemptKey(
      layer.current_artifact_key,
      StorageKeys.layerArtifact(tenantId, docId, layerName, 1),
    );
    const storage = new FsObjectStore({ root: fx.storageRoot });
    expect(await storage.exists(layer.current_artifact_key!)).toBe(true);
    // The stub serializes session state into the artifact (the real
    // engine's contract): one create -> an artifact holding one annotation.
    const artifactBytes = await storage.get(layer.current_artifact_key!);
    expect(layer.current_artifact_size).toBe(artifactBytes!.byteLength);
    expect(parseStubArtifact(artifactBytes!)).toHaveLength(1);

    const auditRows = await fx.db
      .selectFrom('audit_log')
      .selectAll()
      .where('doc_id', '=', docId)
      .execute();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      tenant_id: tenantId,
      doc_id: docId,
      layer_id: layer.id,
      layer_name: layerName,
      sub: 'user-1',
      kind: 'annot.create',
      page_object_number: 1,
      affected_pages_json: '[1]',
      artifact_version: 1,
      artifact_key: layer.current_artifact_key,
      artifact_sha: layer.current_artifact_sha,
      artifact_size: layer.current_artifact_size,
    });

    const day = new Date(Number(auditRows[0]!.ts)).toISOString().slice(0, 10);
    const eventKey = StorageKeys.eventsDay(tenantId, docId, day);
    expect(await storage.exists(eventKey)).toBe(false);

    const exported = await new EventLogService({ storage }).exportDocDayJsonl(fx.db, {
      tenantId,
      docId,
      day,
      allowOpenDay: true,
    });
    expect(exported).toEqual({ key: eventKey, count: 1, status: 'exported' });

    const exportRow = await fx.db
      .selectFrom('audit_exports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('doc_id', '=', docId)
      .where('day', '=', day)
      .executeTakeFirstOrThrow();
    expect(exportRow).toMatchObject({
      status: 'succeeded',
      storage_key: eventKey,
      event_count: 1,
      lease_id: null,
      lease_expires_at: null,
    });

    const jsonlEvents = await readJsonlEvents(storage, eventKey);
    expect(jsonlEvents).toHaveLength(1);
    expect(jsonlEvents[0]).toMatchObject({
      id: Number(auditRows[0]!.id),
      tenantId,
      docId,
      layerId: layer.id,
      layerName,
      sub: 'user-1',
      kind: 'annot.create',
      pageObjectNumber: 1,
      affectedPages: [1],
      artifactVersion: 1,
      artifactKey: layer.current_artifact_key,
      artifactSha: layer.current_artifact_sha,
      artifactSize: layer.current_artifact_size,
    });

    const pages = await fx.db
      .selectFrom('layer_pages')
      .selectAll()
      .where('layer_id', '=', layer.id)
      .orderBy('page_object_number', 'asc')
      .execute();
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      page_object_number: 1,
      annotation_version: 2,
      annotation_generation: 0,
    });
    expect(pages[1]).toMatchObject({
      page_object_number: 2,
      annotation_version: 1,
      annotation_generation: 0,
    });

    const stale = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest@docVersion=1`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` },
      },
    );
    expect(stale.status).toBe(404);

    const fresh = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest@docVersion=2`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` },
      },
    );
    expect(fresh.status).toBe(200);
    const manifest = (await fresh.json()) as {
      pages: Array<{
        state: { pageObjectNumber: number };
        cache: { annotationVersion: number };
      }>;
    };
    expect(
      manifest.pages.find((p) => p.state.pageObjectNumber === 1)?.cache.annotationVersion,
    ).toBe(2);
  });

  test('stable delete creates the next artifact and bumps index generation', async () => {
    const tenantId = 'tenant-layer-del';
    const docId = 'doclayermut002';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(highlightDraft()),
    });

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/obj%3A10001`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` },
      },
    );
    expect(res.status).toBe(200);

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(2);
    expect(layer.doc_version).toBe(3);
    expectAttemptKey(
      layer.current_artifact_key,
      StorageKeys.layerArtifact(tenantId, docId, layerName, 2),
    );

    const page = await fx.db
      .selectFrom('layer_pages')
      .selectAll()
      .where('layer_id', '=', layer.id)
      .where('page_object_number', '=', 1)
      .executeTakeFirstOrThrow();
    expect(page.annotation_version).toBe(3);
    expect(page.annotation_generation).toBe(1);
  });

  test('fresh cloud index delete bridges to worker epoch and bumps generation from DB state', async () => {
    const tenantId = 'tenant-layer-idx';
    const docId = 'doclayermut003';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    await seedLayerPage(fx, {
      tenantId,
      docId,
      layerName,
      annotationVersion: 17,
      annotationGeneration: 10,
      hasWeakAnnotations: true,
    });
    await beginWeakAnnotationSession(fx, tenantId, docId, layerName, [1]);

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/index`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          op: 'delete',
          ref: {
            kind: 'index',
            pageObjectNumber: 1,
            index: 0,
            revision: {
              docSessionId: `cloud:layer:${docId}:${layerName}`,
              pageObjectNumber: 1,
              generation: 10,
            },
          },
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meta: {
        weakRefsInvalidated: boolean;
        shouldRefetch: { reason: string } | null;
        affectedPages: Array<{ revision: { docSessionId: string; generation: number } }>;
      };
    };
    expect(body.meta.weakRefsInvalidated).toBe(true);
    expect(body.meta.shouldRefetch).toEqual({ reason: 'weakRefsInvalidated' });
    expect(body.meta.affectedPages[0]?.revision).toMatchObject({
      docSessionId: `cloud:layer:${docId}:${layerName}`,
      generation: 11,
    });

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(2);
    expect(layer.doc_version).toBe(2);

    const page = await fx.db
      .selectFrom('layer_pages')
      .selectAll()
      .where('layer_id', '=', layer.id)
      .where('page_object_number', '=', 1)
      .executeTakeFirstOrThrow();
    expect(page.annotation_version).toBe(18);
    expect(page.annotation_generation).toBe(11);
  });

  test('weak page delete requires an active weak annotation session covering the page', async () => {
    const tenantId = 'tenant-layer-weak-required';
    const docId = 'doclayermut006';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    await seedLayerPage(fx, {
      tenantId,
      docId,
      layerName,
      annotationVersion: 17,
      annotationGeneration: 10,
      hasWeakAnnotations: true,
    });

    const denied = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/index`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          op: 'delete',
          ref: cloudIndexRef(docId, layerName, 1, 0, 10),
        }),
      },
    );
    expect(denied.status).toBe(409);

    const session = await beginWeakAnnotationSession(fx, tenantId, docId, layerName, []);
    const stillDenied = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/index`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          op: 'delete',
          ref: cloudIndexRef(docId, layerName, 1, 0, 10),
        }),
      },
    );
    expect(stillDenied.status).toBe(409);

    const update = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/weak-annotation-sessions/${session.sessionId}/pages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pageObjectNumbers: [1] }),
      },
    );
    expect(update.status).toBe(200);

    const allowed = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/index`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          op: 'delete',
          ref: cloudIndexRef(docId, layerName, 1, 0, 10),
        }),
      },
    );
    expect(allowed.status).toBe(200);
  });

  test('weak page structural edit is blocked when another distinct editor is active', async () => {
    const tenantId = 'tenant-layer-weak-two-editors';
    const docId = 'doclayermut007';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    await seedLayerPage(fx, {
      tenantId,
      docId,
      layerName,
      annotationVersion: 17,
      annotationGeneration: 10,
      hasWeakAnnotations: true,
    });
    await beginWeakAnnotationSession(fx, tenantId, docId, layerName, [1], 'user-1');
    await beginWeakAnnotationSession(fx, tenantId, docId, layerName, [1], 'user-2');

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/index`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName, 'user-1')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          op: 'delete',
          ref: cloudIndexRef(docId, layerName, 1, 0, 10),
        }),
      },
    );
    expect(res.status).toBe(409);

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(1);
  });

  test('stale cloud index ref fails before saving a new artifact', async () => {
    const tenantId = 'tenant-layer-stale';
    const docId = 'doclayermut004';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    await seedLayerPage(fx, {
      tenantId,
      docId,
      layerName,
      annotationVersion: 17,
      annotationGeneration: 10,
      hasWeakAnnotations: true,
    });
    await beginWeakAnnotationSession(fx, tenantId, docId, layerName, [1]);

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items/index`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          op: 'delete',
          ref: {
            kind: 'index',
            pageObjectNumber: 1,
            index: 0,
            revision: {
              docSessionId: `cloud:layer:${docId}:${layerName}`,
              pageObjectNumber: 1,
              generation: 9,
            },
          },
        }),
      },
    );
    expect(res.status).toBe(400);

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(1);
    expect(layer.doc_version).toBe(1);
  });

  test('page move saves a layer artifact, bumps layer doc version, and rewrites page order', async () => {
    const tenantId = 'tenant-layer-pages';
    const docId = 'doclayermut005';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/move`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageObjectNumbers: [3], destIndex: 0 }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    const body = (await res.json()) as {
      layout: {
        pageCount: number;
        pages: Array<{ pageObjectNumber: number; index: number }>;
      };
      cache: {
        previousDocVersion: number;
        docVersion: number;
        layoutVersion: number;
      } | null;
    };
    // A move returns the new geometry (order), not liveness.
    expect(body.layout.pageCount).toBe(3);
    expect(body.layout.pages.map((page) => page.pageObjectNumber)).toEqual([3, 1, 2]);
    expect(body.layout.pages.map((page) => page.index)).toEqual([0, 1, 2]);
    // Cloud coherence pins: docVersion + layoutVersion both advance by one,
    // no per-page pin changes.
    expect(body.cache).toEqual({ previousDocVersion: 1, docVersion: 2, layoutVersion: 2 });

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(1);
    expect(layer.doc_version).toBe(2);
    expect(Number(layer.layout_version)).toBe(2);
    expectAttemptKey(
      layer.current_artifact_key,
      StorageKeys.layerArtifact(tenantId, docId, layerName, 1),
    );

    // `layer_pages` rows are untouched by a move (display order lives in the
    // artifact/layout, not the table). Assert the page set + pins survive.
    const pages = await fx.db
      .selectFrom('layer_pages')
      .select(['page_object_number', 'annotation_version', 'annotation_generation'])
      .where('layer_id', '=', layer.id)
      .orderBy('page_object_number', 'asc')
      .execute();
    expect(pages.map((page) => Number(page.page_object_number))).toEqual([1, 2, 3]);
    expect(pages.map((page) => Number(page.annotation_version))).toEqual([1, 1, 1]);
    expect(pages.map((page) => Number(page.annotation_generation))).toEqual([0, 0, 0]);
  });

  test('page rotate shares the move commit: versions bump, page rows stay warm', async () => {
    const tenantId = 'tenant-layer-pages';
    const docId = 'doclayermut006';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageObjectNumbers: [1, 2], rotation: 90 }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    const body = (await res.json()) as {
      layout: {
        pageCount: number;
        pages: Array<{ pageObjectNumber: number; rotation: number }>;
      };
      cache: {
        previousDocVersion: number;
        docVersion: number;
        layoutVersion: number;
      } | null;
    };
    // Rotation is presentation metadata: same pages, same order, new values.
    expect(body.layout.pageCount).toBe(3);
    expect(body.layout.pages.map((page) => [page.pageObjectNumber, page.rotation])).toEqual([
      [1, 90],
      [2, 90],
      [3, 0],
    ]);
    expect(body.cache).toEqual({ previousDocVersion: 1, docVersion: 2, layoutVersion: 2 });

    // The audit trail records the rotate against the AFFECTED pages only.
    const audit = await fx.db
      .selectFrom('audit_log')
      .select(['kind', 'affected_pages_json'])
      .where('doc_id', '=', docId)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(audit.kind).toBe('pages.rotate');
    expect(JSON.parse(String(audit.affected_pages_json))).toEqual([1, 2]);

    // `layer_pages` rows are untouched: renders are normalized, every
    // per-page cache stays warm across a rotate.
    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    const pages = await fx.db
      .selectFrom('layer_pages')
      .select(['page_object_number', 'annotation_version', 'annotation_generation'])
      .where('layer_id', '=', layer.id)
      .orderBy('page_object_number', 'asc')
      .execute();
    expect(pages.map((page) => Number(page.page_object_number))).toEqual([1, 2, 3]);
    expect(pages.map((page) => Number(page.annotation_version))).toEqual([1, 1, 1]);
  });

  test('page delete removes the page, its row, and its weak-session claims', async () => {
    const tenantId = 'tenant-layer-pages';
    const docId = 'doclayermut007';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageObjectNumbers: [2] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      layout: {
        pageCount: number;
        pages: Array<{ pageObjectNumber: number; index: number }>;
      };
      cache: {
        previousDocVersion: number;
        docVersion: number;
        layoutVersion: number;
      } | null;
    };
    expect(body.layout.pageCount).toBe(2);
    expect(body.layout.pages.map((page) => page.pageObjectNumber)).toEqual([1, 3]);
    expect(body.layout.pages.map((page) => page.index)).toEqual([0, 1]);
    expect(body.cache).toEqual({ previousDocVersion: 1, docVersion: 2, layoutVersion: 2 });

    const audit = await fx.db
      .selectFrom('audit_log')
      .select(['kind', 'affected_pages_json'])
      .where('doc_id', '=', docId)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(audit.kind).toBe('pages.delete');
    expect(JSON.parse(String(audit.affected_pages_json))).toEqual([2]);

    // The deleted page's row is gone; survivors keep their pins.
    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    const pages = await fx.db
      .selectFrom('layer_pages')
      .select(['page_object_number', 'annotation_version'])
      .where('layer_id', '=', layer.id)
      .orderBy('page_object_number', 'asc')
      .execute();
    expect(pages.map((page) => Number(page.page_object_number))).toEqual([1, 3]);
    expect(pages.map((page) => Number(page.annotation_version))).toEqual([1, 1]);
  });

  test('the audited payload is byte-identical to the HTTP response (event-stream invariant)', async () => {
    // What we tell the caller is what we tell history: the audit row must
    // store the FINALIZED result (cloud-stable revision tokens, real
    // cacheDelta / coherence pins), never the worker's session-relative
    // draft. A remote event subscriber replays exactly these payloads.
    const tenantId = 'tenant-layer-pages';
    const docId = 'doclayermut009';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const headers = {
      Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
      'Content-Type': 'application/json',
    };

    const mutations: Array<{ kind: string; response: unknown }> = [];

    const created = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
      { method: 'POST', headers, body: JSON.stringify(highlightDraft()) },
    );
    expect(created.status).toBe(200);
    mutations.push({ kind: 'annot.create', response: await created.json() });

    const moved = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/move`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [3], destIndex: 0 }),
    });
    expect(moved.status).toBe(200);
    mutations.push({ kind: 'pages.move', response: await moved.json() });

    const rotated = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [2], rotation: 90 }),
    });
    expect(rotated.status).toBe(200);
    mutations.push({ kind: 'pages.rotate', response: await rotated.json() });

    const deleted = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [2] }),
    });
    expect(deleted.status).toBe(200);
    mutations.push({ kind: 'pages.delete', response: await deleted.json() });

    const auditRows = await fx.db
      .selectFrom('audit_log')
      .select(['kind', 'payload_json'])
      .where('doc_id', '=', docId)
      .orderBy('id', 'asc')
      .execute();
    expect(auditRows.map((row) => row.kind)).toEqual(mutations.map((m) => m.kind));
    for (let i = 0; i < mutations.length; i++) {
      expect(JSON.parse(String(auditRows[i]!.payload_json))).toEqual(mutations[i]!.response);
    }
  });

  test('multipart stamp create: body part + resource part → parsed, persisted, version bumped', async () => {
    const tenantId = 'tenant-layer-multipart';
    const docId = 'doclayermut010';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const form = new FormData();
    form.append(
      'body',
      JSON.stringify({
        subtype: 'stamp',
        rect: { left: 100, bottom: 500, right: 260, top: 580 },
        source: { resource: 'r0' },
        fit: 'contain',
      }),
    );
    form.append('resource:r0', new Blob([tinyPng()], { type: 'image/png' }), 'stamp.png');

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` },
        body: form,
      },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
    const body = (await res.json()) as { meta: { cacheDelta: { docVersion: number } } };
    expect(body.meta.cacheDelta.docVersion).toBe(2);

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.current_version).toBe(1); // artifact persisted
  });

  test('multipart create: resource that sniffs to no supported format → 400, nothing committed', async () => {
    const tenantId = 'tenant-layer-multipart';
    const docId = 'doclayermut011';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    const form = new FormData();
    form.append(
      'body',
      JSON.stringify({
        subtype: 'stamp',
        rect: { left: 0, bottom: 0, right: 10, top: 10 },
        source: { resource: 'r0' },
      }),
    );
    form.append(
      'resource:r0',
      new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'image/png' }),
      'not-a-png.png',
    );

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` },
        body: form,
      },
    );
    expect(res.status).toBe(400);

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirst();
    expect(layer?.doc_version ?? 1).toBe(1); // nothing advanced
  });

  test('multipart create without a body part → 400', async () => {
    const tenantId = 'tenant-layer-multipart';
    const docId = 'doclayermut012';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    const form = new FormData();
    form.append('resource:r0', new Blob([tinyPng()], { type: 'image/png' }), 'stamp.png');

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` },
        body: form,
      },
    );
    expect(res.status).toBe(400);
  });

  test('deleting every page is rejected and commits nothing', async () => {
    const tenantId = 'tenant-layer-pages';
    const docId = 'doclayermut008';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageObjectNumbers: [1, 2, 3] }),
    });
    expect(res.status).toBe(400);

    const layer = await fx.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirstOrThrow();
    expect(layer.doc_version).toBe(1); // nothing advanced
  });
});

async function buildFixture(): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'layer-mutations-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'layer-mutations-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildApp({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return { bundle, app: bundle.app, db, baseUrl, storageRoot, cacheRoot };
}

async function tearDown(fx: Fixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

function docToken(tenantId: string, docId: string, layerName: string, sub = 'user-1'): string {
  return signDevToken(SECRET, {
    sub,
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
  });
}

async function beginWeakAnnotationSession(
  fx: Fixture,
  tenantId: string,
  docId: string,
  layerName: string,
  pageObjectNumbers: number[],
  sub = 'user-1',
): Promise<{ sessionId: string; pageObjectNumbers: number[] }> {
  const res = await fetch(
    `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/weak-annotation-sessions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, layerName, sub)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pageObjectNumbers }),
    },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { sessionId: string; pageObjectNumbers: number[] };
}

function cloudIndexRef(
  docId: string,
  layerName: string,
  pageObjectNumber: number,
  index: number,
  generation: number,
): unknown {
  return {
    kind: 'index',
    pageObjectNumber,
    index,
    revision: {
      docSessionId: `cloud:layer:${docId}:${layerName}`,
      pageObjectNumber,
      generation,
    },
  };
}

async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: { pageCount: number },
): Promise<void> {
  const bytes = new Uint8Array(4096);
  bytes[0] = opts.pageCount;
  bytes.set(randomBytes(4095), 1);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const storage = new FsObjectStore({ root: fx.storageRoot });
  await storage.put(StorageKeys.basePdf(tenantId, docId), bytes, {
    contentLength: bytes.byteLength,
  });
  await fx.db
    .insertInto('tenants')
    .values({ id: tenantId, name: tenantId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: tenantId,
      state: 'ready',
      base_sha: sha,
      storage_size_bytes: bytes.byteLength,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
}

async function seedLayerPage(
  fx: Fixture,
  input: {
    tenantId: string;
    docId: string;
    layerName: string;
    annotationVersion: number;
    annotationGeneration: number;
    hasWeakAnnotations: boolean;
  },
): Promise<void> {
  const storage = new FsObjectStore({ root: fx.storageRoot });
  const artifactKey = StorageKeys.layerArtifact(input.tenantId, input.docId, input.layerName, 1);
  await storage.put(artifactKey, new Uint8Array([0x4c, 0x01, 0x00, 0x00]), {
    contentLength: 4,
  });
  const now = Date.now();
  await fx.db
    .insertInto('layers')
    .values({
      id: `layer-${input.docId}`,
      doc_id: input.docId,
      tenant_id: input.tenantId,
      name: input.layerName,
      doc_version: 1,
      current_version: 1,
      current_artifact_key: artifactKey,
      current_artifact_sha: createHash('sha256')
        .update(new Uint8Array([0x4c, 0x01, 0x00, 0x00]))
        .digest('hex'),
      current_artifact_size: 4,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await fx.db
    .insertInto('layer_pages')
    .values({
      layer_id: `layer-${input.docId}`,
      page_object_number: 1,
      content_version: 1,
      annotation_version: input.annotationVersion,
      annotation_generation: input.annotationGeneration,
      has_weak_annotations: input.hasWeakAnnotations ? 1 : 0,
      updated_at: now,
    })
    .execute();
}

/** Minimal valid 2×2 RGBA PNG built from scratch (must pass the server's magic-byte sniff). */
function tinyPng(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(
      [...type].map((ch) => ch.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, 2);
  ihdrView.setUint32(4, 2);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(2 * (1 + 2 * 4));
  raw.set([255, 0, 0, 255, 255, 0, 0, 255], 1);
  raw.set([255, 0, 0, 255, 255, 0, 0, 255], 1 + 1 + 8);
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = new Uint8Array(deflateSync(raw));
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

/**
 * Assert an artifact key is a per-ATTEMPT variant of the expected
 * versioned key: `v{version}-{nonce}.layer` (see LayerService.nextArtifactKey
 * — racing replicas must never share an upload target).
 */
function expectAttemptKey(actual: string | null, versionedKey: string): void {
  const prefix = versionedKey.slice(0, -'.layer'.length);
  expect(actual).toMatch(
    new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[a-z0-9]{8}\\.layer$`),
  );
}

/** Parse the stub worker's v2 layer artifact ([0x4c, 0x02, ...JSON]). */
function parseStubArtifact(bytes: Uint8Array): Array<Record<string, unknown>> {
  const buf = Buffer.from(bytes);
  if (buf.byteLength < 2 || buf[0] !== 0x4c || buf[1] !== 0x02) return [];
  const parsed = JSON.parse(buf.subarray(2).toString('utf8')) as {
    annots: Array<Record<string, unknown>>;
  };
  return parsed.annots;
}

function highlightDraft(): unknown {
  return {
    subtype: 'highlight',
    quadPoints: [
      {
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        p3: { x: 0, y: 10 },
        p4: { x: 10, y: 10 },
      },
    ],
  };
}

async function readJsonlEvents(
  storage: FsObjectStore,
  key: string,
): Promise<Array<Record<string, unknown>>> {
  const bytes = await storage.get(key);
  if (!bytes) return [];
  return Buffer.from(bytes)
    .toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
