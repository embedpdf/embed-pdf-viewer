/**
 * C1: a layer session signs on a candidate opened over its own base (no
 * whole-file copy). With unsaved edits the candidate is fed the artifact a
 * save would write, so edits and signature share one revision; a plain
 * session keeps the freeze-the-loaded-bytes path and produces two.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;

let unsigned: Uint8Array;
let layerEngine: Engine;
let plainEngine: Engine;

beforeAll(async () => {
  unsigned = new Uint8Array(await readFile(resolve(here, 'fixtures', 'unsigned_sigfield.pdf')));
  layerEngine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  plainEngine = await createLocalEngine({ runtime: { prefer: 'wasm' }, sessionKind: 'plain' });
});
afterAll(async () => {
  await layerEngine.destroy();
  await plainEngine.destroy();
});

async function fillThenSign(engine: Engine, id: string) {
  const doc = await engine.open({ kind: 'bytes', id, bytes: unsigned }, { scope: ['*'] });
  try {
    const before = (await doc.signatures!.list()).revisions.length;
    await doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { type: 'text', value: 'agreed' });
    const prepared = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } });
    const result = await doc.signatures!.complete({ signingId: prepared.signingId, expectedVersion: prepared.expectedVersion, cms: FAKE_CMS });
    expect(result.status).toBe('completed');
    expect(result.signature.coverage).toBe('whole-revision');
    const after = await doc.signatures!.list();
    const analysis = await doc.signatures!.analyze({ since: { revisionIndex: 0 } });
    return { before, after: after.revisions.length, analysis };
  } finally {
    await doc.close();
  }
}

describe('signing candidate over the session\'s own base', () => {
  test('a layer session with unsaved edits: edits and signature share ONE revision', async () => {
    const { before, after, analysis } = await fillThenSign(layerEngine, 'reuse-layer');
    expect(after).toBe(before + 1);
    expect(analysis.verdict).toBe('permitted');
    const last = analysis.steps.at(-1)!;
    expect(last.findings.some((f) => f.rule === 'form-fill' && f.verdict === 'permitted')).toBe(true);
    expect(last.findings.some((f) => f.rule === 'signature-added' && f.verdict === 'permitted')).toBe(true);
  });

  test('a plain session keeps the freeze path: edits revision, then signature revision', async () => {
    const { before, after, analysis } = await fillThenSign(plainEngine, 'reuse-plain');
    expect(after).toBe(before + 2);
    expect(analysis.verdict).toBe('permitted');
  });

  test('a second signature on a layer session reuses the sealed base and appends one revision', async () => {
    const doc = await layerEngine.open({ kind: 'bytes', id: 'reuse-second', bytes: unsigned }, { scope: ['*'] });
    try {
      const first = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' }, certify: { permission: 2 } });
      await doc.signatures!.complete({ signingId: first.signingId, expectedVersion: first.expectedVersion, cms: FAKE_CMS });
      const sealed = (await doc.signatures!.list()).revisions.length;
      await doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { type: 'text', value: 'after certification' });
      const working = await doc.signatures!.analyze({ since: { signatureIndex: 0 }, until: 'working-copy' });
      expect(working.verdict).toBe('permitted');
      const bytes = new Uint8Array(await doc.download());
      const reopened = await layerEngine.open({ kind: 'bytes', id: 'reuse-second-b', bytes }, { scope: ['*'] });
      try {
        expect((await reopened.signatures!.list()).revisions.length).toBe(sealed + 1);
        expect((await reopened.signatures!.analyze({ since: { signatureIndex: 0 } })).verdict).toBe('permitted');
      } finally {
        await reopened.close();
      }
    } finally {
      await doc.close();
    }
  });
});
