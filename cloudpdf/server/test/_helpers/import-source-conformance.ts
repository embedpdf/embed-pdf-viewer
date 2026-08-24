/**
 * Shared ImportSource conformance suite — the anti-divergence
 * guarantee for pull sources, mirroring the ObjectStore suite: one
 * assertion set for the universal open() contract, run against every
 * adapter through a small per-backend harness. Provider-specific
 * behaviors (revisions, error taxonomies beyond the shared classes)
 * live in per-adapter test files.
 */
import { beforeEach, describe, expect, test } from 'vitest';

import { ImportSourceError, type ImportSource } from '../../src/import/ImportSource';

export interface ImportSourceHarness {
  /** Provision an object the source can read. */
  seed(name: string, bytes: Uint8Array, opts?: { contentType?: string }): Promise<void> | void;
  /** Build a source addressing the named object. */
  source(name: string, opts?: { maxBytes?: number }): ImportSource;
  /** A name that does not exist in the backend. */
  missingName(): string;
}

function patternBytes(n: number, seed = 1): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * seed + 7) % 256;
  return a;
}

async function drain(body: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks);
}

export function runImportSourceConformance(
  label: string,
  makeHarness: () => Promise<ImportSourceHarness> | ImportSourceHarness,
): void {
  describe(`ImportSource conformance — ${label}`, () => {
    let h: ImportSourceHarness;
    beforeEach(async () => {
      h = await makeHarness();
    });

    const freshSignal = (): AbortSignal => new AbortController().signal;

    async function openError(source: ImportSource, signal?: AbortSignal): Promise<ImportSourceError> {
      const err = await source.open({ signal: signal ?? freshSignal() }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ImportSourceError);
      return err as ImportSourceError;
    }

    test('open() streams the declared bytes with an exact length', async () => {
      const bytes = patternBytes(48_000, 3);
      await h.seed('conf-obj-a', bytes, { contentType: 'application/pdf' });
      const opened = await h.source('conf-obj-a').open({ signal: freshSignal() });
      expect(opened.contentLength).toBe(bytes.byteLength);
      expect(opened.contentType ?? 'application/pdf').toContain('application/pdf');
      expect(await drain(opened.body)).toEqual(Buffer.from(bytes));
    });

    test('a missing object maps to terminal not_found', async () => {
      const err = await openError(h.source(h.missingName()));
      expect(err.code).toBe('not_found');
      expect(err.retryable).toBe(false);
    });

    test('a declared length above the policy cap maps to too_large', async () => {
      const bytes = patternBytes(4_096, 5);
      await h.seed('conf-obj-big', bytes);
      const err = await openError(h.source('conf-obj-big', { maxBytes: 64 }));
      expect(err.code).toBe('too_large');
      expect(err.retryable).toBe(false);
    });

    test('an aborted signal maps to a retryable failure', async () => {
      const bytes = patternBytes(512, 9);
      await h.seed('conf-obj-abort', bytes);
      const ac = new AbortController();
      ac.abort();
      const err = await openError(h.source('conf-obj-abort'), ac.signal);
      expect(err.retryable).toBe(true);
    });

    test('info carries a kind and a non-empty location', async () => {
      const s = h.source('conf-obj-info');
      expect(typeof s.info.kind).toBe('string');
      expect(typeof s.info.location).toBe('string');
      expect(s.info.location.length).toBeGreaterThan(0);
    });
  });
}
