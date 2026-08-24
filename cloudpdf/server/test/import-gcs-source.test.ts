/**
 * GCS import source: shared conformance over an in-memory SDK fake,
 * plus generation (revision) semantics — pinning, mismatch, digit
 * validation, and stat-generation read pinning.
 */
import { Readable } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';

import { ImportConnectionSchema, type GcsImportConnection } from '../src/import/config/ImportConnectionSchema';
import { ImportPolicySchema, type ImportPolicy } from '../src/import/config/ImportPolicySchema';
import { ImportSourceError } from '../src/import/ImportSource';
import { runImportSourceConformance } from './_helpers/import-source-conformance';

const g = vi.hoisted(() => {
  interface Obj {
    bytes: Buffer;
    contentType?: string;
    generation: number;
  }
  return { objects: new Map<string, Obj>(), nextGeneration: 1000 };
});

vi.mock('@google-cloud/storage', () => {
  const gcsErr = (code: number): Error => Object.assign(new Error(`gcs ${code}`), { code });
  class FakeFile {
    constructor(
      readonly key: string,
      readonly opts?: { generation?: number },
    ) {}
    async getMetadata(): Promise<[Record<string, unknown>, unknown]> {
      if (this.key.startsWith('err/')) throw gcsErr(Number(this.key.slice(4)));
      const o = g.objects.get(this.key);
      if (!o) throw gcsErr(404);
      if (this.opts?.generation !== undefined && this.opts.generation !== o.generation) {
        throw gcsErr(404);
      }
      return [
        {
          size: String(o.bytes.byteLength),
          generation: String(o.generation),
          ...(o.contentType ? { contentType: o.contentType } : {}),
        },
        null,
      ];
    }
    createReadStream(): Readable {
      const o = g.objects.get(this.key);
      if (!o || (this.opts?.generation !== undefined && this.opts.generation !== o.generation)) {
        const r = new Readable({ read() {} });
        process.nextTick(() => r.destroy(gcsErr(404)));
        return r;
      }
      return Readable.from([o.bytes]);
    }
  }
  class FakeBucket {
    file(key: string, opts?: { generation?: number }): FakeFile {
      return new FakeFile(key, opts);
    }
  }
  return {
    Storage: class {
      bucket(): FakeBucket {
        return new FakeBucket();
      }
    },
  };
});

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
  const generation = ++g.nextGeneration;
  g.objects.set(name, {
    bytes: Buffer.from(bytes),
    ...(contentType ? { contentType } : {}),
    generation,
  });
  return generation;
}

runImportSourceConformance('gcs', () => {
  g.objects.clear();
  return {
    seed(name, bytes, opts) {
      seed(name, bytes, opts?.contentType);
    },
    source(name, opts) {
      return sourceFor(name, { ...(opts?.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}) });
    },
    missingName: () => 'definitely-missing',
  };
});

describe('GcsImportSource specifics', () => {
  const signal = (): AbortSignal => new AbortController().signal;

  test('revisions pin generations and resolvedRevision reports what was served', async () => {
    const gen = seed('inv/a.pdf', Buffer.from('%PDF gcs bytes'));
    const opened = await sourceFor('inv/a.pdf', { revision: String(gen) }).open({ signal: signal() });
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
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ImportSourceError);
    expect((err as ImportSourceError).code).toBe('not_found');
  });

  test.each([['0'], ['abc'], ['-5'], ['1.5']])('revision %s is refused as non-generation', (rev) => {
    expect(() => sourceFor('inv/a.pdf', { revision: rev })).toThrowError(/positive decimal integer/);
  });

  test('403 maps to terminal denied', async () => {
    const err = await sourceFor('err/403')
      .open({ signal: signal() })
      .then(() => null, (e: unknown) => e);
    expect((err as ImportSourceError).code).toBe('denied');
  });

  test('empty objects are refused', async () => {
    seed('inv/empty.pdf', Buffer.alloc(0));
    const err = await sourceFor('inv/empty.pdf')
      .open({ signal: signal() })
      .then(() => null, (e: unknown) => e);
    expect((err as ImportSourceError).code).toBe('unsupported');
  });

  test('info identifies the connection without secrets', () => {
    expect(sourceFor('inv/a.pdf').info).toMatchObject({
      kind: 'gcs',
      location: 'gs://gcs-bucket/inv/a.pdf',
      connectionId: 'gcs-conn',
    });
  });
});
