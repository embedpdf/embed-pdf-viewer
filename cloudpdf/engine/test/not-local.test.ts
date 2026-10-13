import { EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';

import { cloudEngine, isLocalEngine } from '../src/index';

/**
 * Local-only members (fonts, warmup, a document's layer and version reads, raw
 * pixels) live on the local types, reached through `isLocalEngine` and
 * `isLocalDocument`. Fallback fonts are a server policy on the cloud engine, so
 * clients cannot configure them. This locks that in: the cloud engine never
 * passes the local check or grows those members.
 */
describe('cloud engine is not local', () => {
  test('fails the local check and has no local-only members', () => {
    const engine = cloudEngine({ baseUrl: 'http://localhost' });
    expect(isLocalEngine(engine)).toBe(false);
    expect('fonts' in engine).toBe(false);
    expect('warmup' in engine).toBe(false);
  });

  test("doesn't open files: a file's bytes are refused, as it says", async () => {
    const engine = cloudEngine({ baseUrl: 'http://localhost' });
    expect(engine.canOpenFiles).toBe(false);
    await expect(
      engine.open({ kind: 'bytes', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }),
    ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
  });
});
