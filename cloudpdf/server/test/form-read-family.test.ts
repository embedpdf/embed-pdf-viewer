/**
 * The form is its own read family, on the native engine: `form@` holds the
 * fields and every widget row, `form/pages/{p}/appearances@` a page's widget
 * images, each with its own pins (`formsVersion`, `widgetVersion`) and its
 * own `forms` plane. A fill moves no annotation URL, a layer that only fills
 * keeps sharing the base's annotations, the annotation reads hold no widget,
 * and a widget's place and look are a form write.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  encodeFormToken,
  encodeAnnotationsAllToken,
  widgetAppearancesImageOptionsToToken,
  annotationAppearancesImageOptionsToToken,
} from '@embedpdf/engine-core/wire';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const SECRET = 'form-read-family-secret';
const TENANT = 'tenant-form-family';
const DOC = 'doc-form-family';
/** The fixture's first page: a square, a note with its popup and reply, and the `name` field's widget (9). */
const PAGE = 3;
const WIDGET = 9;

let dir: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'form-read-family-'));
  const storageRoot = join(dir, 'objects');
  db = createSqliteDb({ path: join(dir, 'server.db') });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: new URL('../dist/runtime/worker-entry.js', import.meta.url),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: join(dir, 'cache'),
    cacheMaxBytes: 4 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;

  const bytes = CHANGE_FIXTURE_PDF;
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, {
    contentLength: bytes.byteLength,
  });
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await db
    .insertInto('documents')
    .values({
      id: DOC,
      tenant_id: TENANT,
      state: 'ready',
      base_sha: createHash('sha256').update(bytes).digest('hex'),
      storage_size_bytes: bytes.byteLength,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
}, 60_000);

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await rm(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

async function call(
  method: string,
  path: string,
  opts: { layer: string; scope?: string[]; body?: unknown },
): Promise<Answer> {
  const token = signDevToken(SECRET, {
    sub: 'alice',
    tenant_id: TENANT,
    doc_id: DOC,
    layer_name: opts.layer,
    scope: opts.scope ?? ['*'],
  });
  const res = await fetch(`${baseUrl}/v1/docs/${DOC}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // a multipart body stays text
  }
  return { status: res.status, body };
}

const manifestOf = async (layer: string) =>
  (await call('GET', `/layers/${layer}/manifest`, { layer })).body;

const pageOf = (manifest: { pages: { page: { objectNumber: number }; cache: unknown }[] }) =>
  manifest.pages.find((p) => p.page.objectNumber === PAGE)!.cache as {
    annotationVersion: number;
    widgetVersion: number;
  };

describe('the form read family', () => {
  test('the form holds the fields and the widget rows; the annotations hold no widget', async () => {
    const manifest = await manifestOf('reader');
    const form = await call('GET', `/form@${encodeFormToken(manifest.formsVersion)}`, {
      layer: 'reader',
    });
    expect(form.status).toBe(200);
    expect(form.body.fields.map((field: { name: string }) => field.name)).toEqual(['name']);
    expect(
      form.body.widgets.map((widget: { ref: { objectNumber: number } }) => widget.ref.objectNumber),
    ).toEqual([WIDGET]);

    const annotations = await call(
      'GET',
      `/annotations/items@${encodeAnnotationsAllToken(manifest.annotationsVersion)}`,
      { layer: 'reader' },
    );
    expect(annotations.status).toBe(200);
    const subtypes = annotations.body.annotations.map((a: { subtype: string }) => a.subtype);
    expect(subtypes).not.toContain('widget');
    expect(subtypes).toContain('square');
  });

  test("each family's images come from its own batch", async () => {
    const manifest = await manifestOf('reader');
    const cache = pageOf(manifest);
    const options = { format: 'png' as const, viewport: { kind: 'scale' as const, scale: 1 } };
    const widgets = await call(
      'GET',
      `/form/pages/obj:${PAGE}/appearances@${widgetAppearancesImageOptionsToToken(options, {
        widgetVersion: cache.widgetVersion,
      })}`,
      { layer: 'reader' },
    );
    expect(widgets.status).toBe(200);
    expect(String(widgets.body)).toContain(`"objectNumber":${WIDGET}`);
    const annotations = await call(
      'GET',
      `/annotations/pages/obj:${PAGE}/appearances@${annotationAppearancesImageOptionsToToken(
        options,
        { annotationVersion: cache.annotationVersion },
      )}`,
      { layer: 'reader' },
    );
    expect(annotations.status).toBe(200);
    expect(String(annotations.body)).not.toContain(`"objectNumber":${WIDGET}`);
  });

  test('a fill moves only the form pins; the layer keeps sharing the annotations', async () => {
    const before = await manifestOf('filler');
    const filled = await call('POST', `/layers/filler/form/fields/obj:${WIDGET}/value`, {
      layer: 'filler',
      body: { value: { value: 'Bea' } },
    });
    expect(filled.status, JSON.stringify(filled.body)).toBe(200);
    expect(
      filled.body.widgets.map((w: { ref: { objectNumber: number } }) => w.ref.objectNumber),
    ).toEqual([WIDGET]);

    const after = await manifestOf('filler');
    expect(after.annotationsVersion).toBe(before.annotationsVersion);
    expect(after.formsVersion).toBeGreaterThan(before.formsVersion);
    expect(pageOf(after).annotationVersion).toBe(pageOf(before).annotationVersion);
    expect(pageOf(after).widgetVersion).toBeGreaterThan(pageOf(before).widgetVersion);
    expect(after.scopes).toMatchObject({ annotations: 'base', forms: 'layer' });

    // The shared annotation list still serves the filler; the shared form doesn't.
    const annotations = await call(
      'GET',
      `/annotations/items@${encodeAnnotationsAllToken(after.annotationsVersion)}`,
      { layer: 'filler' },
    );
    expect(annotations.status).toBe(200);
    const sharedForm = await call('GET', `/form@${encodeFormToken(after.formsVersion)}`, {
      layer: 'filler',
    });
    expect(sharedForm.status).toBe(404);
    const ownForm = await call(
      'GET',
      `/layers/filler/form@${encodeFormToken(after.formsVersion)}`,
      {
        layer: 'filler',
      },
    );
    expect(ownForm.status).toBe(200);
    expect(ownForm.body.fields[0].value).toBe('Bea');
  });

  test("a widget's place and look are a form write; the annotation routes refuse it", async () => {
    const before = await manifestOf('designer');
    const moved = await call('PATCH', `/layers/designer/form/widgets/obj:${PAGE}/obj:${WIDGET}`, {
      layer: 'designer',
      body: { patch: { rect: { x: 20, y: 200, width: 200, height: 30 } } },
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.widget.rect).toEqual({ x: 20, y: 200, width: 200, height: 30 });
    const after = await manifestOf('designer');
    expect(after.annotationsVersion).toBe(before.annotationsVersion);
    expect(after.formsVersion).toBeGreaterThan(before.formsVersion);

    const asAnnotation = await call(
      'PATCH',
      `/layers/designer/annotations/pages/obj:${PAGE}/items/obj:${WIDGET}`,
      { layer: 'designer', body: { patch: { subtype: 'widget', color: '#ff0000' } } },
    );
    expect(asAnnotation.status).toBe(400);
  });

  test('a filler reads the form, never the annotations', async () => {
    const scope = ['doc.open', 'doc.render', 'doc.forms.fill'];
    const manifest = await manifestOf('reader');
    const form = await call('GET', `/form@${encodeFormToken(manifest.formsVersion)}`, {
      layer: 'reader',
      scope,
    });
    expect(form.status).toBe(200);
    const annotations = await call(
      'GET',
      `/annotations/items@${encodeAnnotationsAllToken(manifest.annotationsVersion)}`,
      { layer: 'reader', scope },
    );
    expect(annotations.status).toBe(403);
  });
});
