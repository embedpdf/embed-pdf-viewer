import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { AbortError } from '../promise/AbortError';

export interface ConformanceTestRunner {
  describe(name: string, fn: () => void): void;
  test(name: string, fn: () => void | Promise<void>): void;
  beforeAll(fn: () => void | Promise<void>): void;
  afterAll(fn: () => void | Promise<void>): void;
  expect: ConformanceExpect;
}

export interface ConformanceExpect {
  (actual: unknown): {
    toBe(expected: unknown): void;
    toBeNull(): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(re: RegExp): void;
    toMatchObject(shape: Record<string, unknown>): void;
    toContain(expected: unknown): void;
    toBeInstanceOf(ctor: Function): void;
    toBeTruthy(): void;
    rejects: {
      toBeInstanceOf(ctor: Function): Promise<void>;
      toMatchObject(shape: Record<string, unknown>): Promise<void>;
    };
    resolves: {
      toMatchObject(shape: Record<string, unknown>): Promise<void>;
      toEqual(expected: unknown): Promise<void>;
    };
  };
}

export interface ConformanceFixture {
  /** Stable id used for the local engine; cloud uses its own id. */
  id: string;
  /** Bytes for the local engine. */
  bytes: () => Uint8Array | Promise<Uint8Array>;
  /** Override the cloud-side id. Defaults to `id`. */
  cloudId?: string;
  /** The expected document metadata. Used for parity assertions. */
  expected: Partial<DocumentMetadata>;
}

export interface ConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. Suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Sample fixture for the happy-path metadata read. */
  fixture: ConformanceFixture;
  /** Engine 'kind' for opening: 'bytes' for local, 'id' for cloud. */
  openKind: 'bytes' | 'id';
}

/**
 * The conformance harness is transport-agnostic. It takes the test runner as
 * a parameter so engine-core has no dependency on vitest/jest/node:test.
 */
export function runMetadataConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`metadata conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('reads metadata from sample fixture', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const meta = await doc.metadata.read();
        expect(meta).toMatchObject(opts.fixture.expected);
        expect(meta.trapped).toMatch(/^(true|false|unknown)$/);
      } finally {
        await doc.close();
      }
    });

    test('abort() before completion rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const p = doc.metadata.read();
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('aborting one read does not affect a concurrent one', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const a = doc.metadata.read();
        const b = doc.metadata.read();
        a.abort('test');
        await expect(a).rejects.toBeInstanceOf(AbortError);
        await expect(b).resolves.toMatchObject(opts.fixture.expected);
      } finally {
        await doc.close();
      }
    });

    test('metadata after close throws DocNotOpen', async () => {
      const doc = await openFixture(engine, opts);
      await doc.close();
      let caught: unknown;
      try {
        await doc.metadata.read();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeTruthy();
      expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
    });

    test('update() sets standard + custom fields and a subsequent read observes them', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const result = await doc.metadata.update({
          title: 'Conformance Title',
          subject: 'Conformance Subject',
          custom: { ConformanceKey: 'conformance-value' },
        });
        // The result carries the re-read metadata; cloud also carries cache
        // pins (local is null) — both expose the post-write values here.
        expect(result.metadata.title).toBe('Conformance Title');
        expect(result.metadata.subject).toBe('Conformance Subject');
        expect(result.metadata.custom.ConformanceKey).toBe('conformance-value');

        // A fresh read goes through the versioned leaf (cloud) / re-read
        // (local) and must observe the same write.
        const after = await doc.metadata.read();
        expect(after.title).toBe('Conformance Title');
        expect(after.subject).toBe('Conformance Subject');
        expect(after.custom.ConformanceKey).toBe('conformance-value');
      } finally {
        await doc.close();
      }
    });

    test('update() clears a field with null', async () => {
      const doc = await openFixture(engine, opts);
      try {
        await doc.metadata.update({ title: 'To Be Cleared' });
        const set = await doc.metadata.read();
        expect(set.title).toBe('To Be Cleared');

        await doc.metadata.update({ title: null });
        const cleared = await doc.metadata.read();
        expect(cleared.title).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('update() after close throws DocNotOpen', async () => {
      const doc = await openFixture(engine, opts);
      await doc.close();
      let caught: unknown;
      try {
        await doc.metadata.update({ title: 'nope' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeTruthy();
      expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions) {
  if (opts.openKind === 'bytes') {
    const bytes = await opts.fixture.bytes();
    return engine.open({ kind: 'bytes', id: opts.fixture.id, bytes });
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
