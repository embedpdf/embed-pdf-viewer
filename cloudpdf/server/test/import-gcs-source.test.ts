/**
 * GCS import source: shared conformance over the in-memory SDK fake
 * (`__mocks__/@google-cloud/storage.ts`), plus generation (revision)
 * semantics — pinning, mismatch, digit validation, and stat-generation
 * read pinning.
 */
import { describe, expect, test, vi } from 'vitest';

import { FakeBucket, gcs } from '../__mocks__/@google-cloud/storage';

import {
  ImportConnectionSchema,
  type GcsImportConnection,
} from '../src/import/config/ImportConnectionSchema';
import { ImportPolicySchema, type ImportPolicy } from '../src/import/config/ImportPolicySchema';
import { ImportSourceError } from '../src/import/ImportSource';
import { runImportSourceConformance } from './_helpers/import-source-conformance';

// No factory: vitest serves __mocks__/@google-cloud/storage.ts.
vi.mock('@google-cloud/storage');

const { GcsImportSource } = await import('../src/import/adapters/GcsImportSource');

const CONN = ImportConnectionSchema.parse({
  kind: 'gcs',
  id: 'gcs-conn',
  bucket: 'gcs-bucket',
}) as GcsImportConnection;

function policyFor(maxBytes?: number): ImportPolicy {
  return ImportPolicySchema.parse(maxBytes === undefined ? {} : { maxBytes });
}

function sourceFor(key: string, opts: { revision?: string; maxBytes?: number } = {}) {
  return new GcsImportSource({
    connection: CONN,
    key,
    revision: opts.revision,
    policy: policyFor(opts.maxBytes),
  });
}

function seed(name: string, bytes: Uint8Array, contentType?: string): number {
  const generation = ++gcs.generation;
  gcs.objects.set(name, {
    bytes: Buffer.from(bytes),
    ...(contentType ? { contentType } : {}),
    metadata: {},
    generation,
  });
  return generation;
}

/** The source's SDK bucket, made without calling it: a real one would call Google. */
function bucketOf(source: ReturnType<typeof sourceFor>): Promise<unknown> {
  return (source as unknown as { bucket(): Promise<unknown> }).bucket();
}

runImportSourceConformance('gcs', () => {
  gcs.objects.clear();
  gcs.failures.clear();
  return {
    seed(name, bytes, opts) {
      seed(name, bytes, opts?.contentType);
    },
    source(name, opts) {
      return sourceFor(name, {
        ...(opts?.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}),
      });
    },
    missingName: () => 'definitely-missing',
  };
});

describe('GcsImportSource specifics', () => {
  const signal = (): AbortSignal => new AbortController().signal;

  test('revisions pin generations and resolvedRevision reports what was served', async () => {
    const gen = seed('inv/a.pdf', Buffer.from('%PDF gcs bytes'));
    const opened = await sourceFor('inv/a.pdf', { revision: String(gen) }).open({
      signal: signal(),
    });
    expect(opened.resolvedRevision).toBe(String(gen));
    expect(opened.contentLength).toBe(14);
  });

  test('an unpinned read reports the served generation', async () => {
    const gen = seed('inv/b.pdf', Buffer.from('x'));
    const opened = await sourceFor('inv/b.pdf').open({ signal: signal() });
    expect(opened.resolvedRevision).toBe(String(gen));
  });

  test('a wrong generation maps to terminal not_found', async () => {
    const gen = seed('inv/c.pdf', Buffer.from('x'));
    const err = await sourceFor('inv/c.pdf', { revision: String(gen + 1) })
      .open({ signal: signal() })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(ImportSourceError);
    expect((err as ImportSourceError).code).toBe('not_found');
  });

  test.each([['0'], ['abc'], ['-5'], ['1.5']])(
    'revision %s is refused as non-generation',
    (rev) => {
      expect(() => sourceFor('inv/a.pdf', { revision: rev })).toThrowError(
        /positive decimal integer/,
      );
    },
  );

  test('403 maps to terminal denied', async () => {
    gcs.failures.set('inv/locked.pdf', 403);
    const err = await sourceFor('inv/locked.pdf')
      .open({ signal: signal() })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((err as ImportSourceError).code).toBe('denied');
  });

  test('empty objects are refused', async () => {
    seed('inv/empty.pdf', Buffer.alloc(0));
    const err = await sourceFor('inv/empty.pdf')
      .open({ signal: signal() })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((err as ImportSourceError).code).toBe('unsupported');
  });

  test('sources opened back to back all get the fake SDK', async () => {
    // Each source starts its own import of the SDK on first use, so these
    // imports overlap. A vi.mock factory hands about half of them the
    // real client.
    const buckets = await Promise.all(
      Array.from({ length: 8 }, () => bucketOf(sourceFor('inv/a.pdf'))),
    );
    expect(buckets.every((b) => b instanceof FakeBucket)).toBe(true);
  });

  test('info identifies the connection without secrets', () => {
    expect(sourceFor('inv/a.pdf').info).toMatchObject({
      kind: 'gcs',
      location: 'gs://gcs-bucket/inv/a.pdf',
      connectionId: 'gcs-conn',
    });
  });
});
