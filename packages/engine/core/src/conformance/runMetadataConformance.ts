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
        const meta = await doc.metadata.get();
        expect(meta).toMatchObject(opts.fixture.expected);
        expect(meta.trapped).toMatch(/^(true|false|unknown)$/);
      } finally {
        await doc.close();
      }
    });

    test('abort() before completion rejects with AbortError', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const p = doc.metadata.get();
        p.abort('test');
        await expect(p).rejects.toBeInstanceOf(AbortError);
      } finally {
        await doc.close();
      }
    });

    test('aborting one read does not affect a concurrent one', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const a = doc.metadata.get();
        const b = doc.metadata.get();
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
        await doc.metadata.get();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeTruthy();
      expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
    });

    test('update() sets standard fields, custom.update() sets custom keys, each read sees its own', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const result = await doc.metadata.update({
          title: 'Conformance Title',
          subject: 'Conformance Subject',
        });
        // The result carries the re-read metadata; cloud also carries cache
        // pins (local is null) — both expose the post-write values here.
        expect(result.metadata.title).toBe('Conformance Title');
        expect(result.metadata.subject).toBe('Conformance Subject');
        expect('custom' in result.metadata).toBe(false);

        const customResult = await doc.metadata.custom.update({
          ConformanceKey: 'conformance-value',
        });
        expect(customResult.custom['ConformanceKey']).toBe('conformance-value');

        // A fresh read goes through the versioned leaf (cloud) / re-read
        // (local) and must observe the same writes.
        const after = await doc.metadata.get();
        expect(after.title).toBe('Conformance Title');
        expect(after.subject).toBe('Conformance Subject');
        const afterCustom = await doc.metadata.custom.get();
        expect(afterCustom['ConformanceKey']).toBe('conformance-value');
      } finally {
        await doc.close();
      }
    });

    test('custom.update(): a key left out stays, null removes, standard fields are untouched', async () => {
      const doc = await openFixture(engine, opts);
      try {
        await doc.metadata.update({ title: 'Kept Title' });
        await doc.metadata.custom.update({ KeepMe: 'a', DropMe: 'b' });
        const { custom } = await doc.metadata.custom.update({ DropMe: null, AddMe: 'c' });
        expect(custom['KeepMe']).toBe('a');
        expect('DropMe' in custom).toBe(false);
        expect(custom['AddMe']).toBe('c');
        expect((await doc.metadata.custom.get())['KeepMe']).toBe('a');
        expect((await doc.metadata.get()).title).toBe('Kept Title');
      } finally {
        await doc.close();
      }
    });

    test("'' is a value, and custom.update() refuses a key it can't write", async () => {
      const doc = await openFixture(engine, opts);
      try {
        await doc.metadata.update({ title: '' });
        await doc.metadata.custom.update({ EmptyKey: '' });
        expect((await doc.metadata.get()).title).toBe('');
        expect((await doc.metadata.custom.get())['EmptyKey']).toBe('');

        for (const key of ['Title', 'Bad\u0001Key', '']) {
          let caught: unknown;
          try {
            await doc.metadata.custom.update({ NotWritten: 'x', [key]: 'x' });
          } catch (err) {
            caught = err;
          }
          expect(EngineError.is(caught, EngineErrorCode.InvalidArg)).toBe(true);
          expect((caught as EngineError).details?.['field']).toBe(key);
        }
        // Refused whole: the valid key in the same patch wasn't written.
        expect('NotWritten' in (await doc.metadata.custom.get())).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('update() clears a field with null', async () => {
      const doc = await openFixture(engine, opts);
      try {
        await doc.metadata.update({ title: 'To Be Cleared' });
        const set = await doc.metadata.get();
        expect(set.title).toBe('To Be Cleared');

        await doc.metadata.update({ title: null });
        const cleared = await doc.metadata.get();
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

    test('custom reads and writes after close throw DocNotOpen', async () => {
      const doc = await openFixture(engine, opts);
      await doc.close();
      for (const call of [() => doc.metadata.custom.get(), () => doc.metadata.custom.update({})]) {
        let caught: unknown;
        try {
          await call();
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
      }
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
