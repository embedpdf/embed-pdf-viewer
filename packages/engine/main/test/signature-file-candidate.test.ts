/**
 * C2–C4: a file-backed session (a base file, Node native runtime) signs
 * through a file candidate beside its base: the base streams through the
 * writer, only the signature object's span is ever held in memory, the
 * sealed file becomes the session's new file base, and an untouched
 * session's download is the file verbatim. Skipped when the native
 * runtime is not built on this machine.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;

let engine: Engine;
let dir: string;
let basePath: string;
let available = false;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'epdf-file-candidate-'));
  basePath = join(dir, 'base.pdf');
  await copyFile(resolve(here, 'fixtures', 'unsigned_sigfield.pdf'), basePath);
  engine = await createLocalEngine({ runtime: { prefer: 'native' } });
  try {
    const probe = await engine.open({ kind: 'layerFile', id: 'probe', basePath }, { scope: ['*'] });
    await probe.close();
    available = true;
  } catch (error) {
    if (!/native Node runtime|Native runtime/.test(String(error))) throw error;
    console.warn('file-candidate tests skipped: native runtime unavailable');
  }
});
afterAll(async () => {
  await engine.destroy();
});

const candidates = async () => (await readdir(dir)).filter((f) => f.includes('.signing-'));

describe('file-backed signing candidate', () => {
  test('prepare writes the candidate beside the base; complete installs it as the new file base', async () => {
    if (!available) return;
    const doc = await engine.open({ kind: 'layerFile', id: 'file-sign', basePath }, { scope: ['*'] });
    try {
      await doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { type: 'text', value: 'on disk' });
      const prepared = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' }, certify: { permission: 2 } });
      const pending = await candidates();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toContain(prepared.signingId);
      const candidatePath = join(dir, pending[0]);
      const baseSize = (await stat(basePath)).size;
      expect((await stat(candidatePath)).size).toBeGreaterThan(baseSize);
      // The candidate's /ByteRange covers the whole file but the /Contents hole.
      const [, r1, r2, r3] = prepared.byteRange;
      expect(r2 + r3).toBe((await stat(candidatePath)).size);
      expect(r1).toBeLessThan(r2);

      const result = await doc.signatures!.complete({ signingId: prepared.signingId, expectedVersion: prepared.expectedVersion, cms: FAKE_CMS });
      expect(result.status).toBe('completed');
      expect(result.signature.coverage).toBe('whole-revision');
      expect(result.signature.docMdp).toBe(2);

      // The session's version is the sealed file's hash, and a download returns it verbatim.
      const sealed = await readFile(candidatePath);
      expect(result.version.sha256).toBe(sha256(sealed));
      const downloaded = new Uint8Array(await doc.download());
      expect(sha256(downloaded)).toBe(sha256(sealed));

      // Editing continues on a fresh layer over the sealed file; the fill survived.
      const after = await doc.signatures!.list();
      expect(after.signatures[0].signed).toBe(true);
      const text = await doc.forms.get({ kind: 'fqn', name: 'group.total' });
      expect((text as { value?: string }).value).toBe('on disk');

      // A second signing reuses the sealed file as its base and, when aborted, leaves nothing behind.
      const second = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } }).catch(() => null);
      expect(second).toBeNull(); // the only field is signed
      expect(await candidates()).toHaveLength(1); // the sealed file itself
    } finally {
      await doc.close();
    }
  });

  test('abort removes the candidate file; close removes a still-pending one', async () => {
    if (!available) return;
    const before = await candidates();
    const doc = await engine.open({ kind: 'layerFile', id: 'file-abort', basePath }, { scope: ['*'] });
    try {
      const prepared = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } });
      expect((await candidates()).length).toBe(before.length + 1);
      expect((await doc.signatures!.abort(prepared.signingId)).status).toBe('aborted');
      expect((await candidates()).length).toBe(before.length);
      await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } });
      expect((await candidates()).length).toBe(before.length + 1);
    } finally {
      await doc.close();
    }
    expect((await candidates()).length).toBe(before.length);
  });

  test('an untouched file session saves itself verbatim (base plus loaded delta)', async () => {
    if (!available) return;
    // Build a layer artifact with an edit, then open a fresh session over the base with it.
    const editing = await engine.open({ kind: 'layerFile', id: 'file-edit', basePath }, { scope: ['*'] });
    let artifact: Uint8Array;
    try {
      await editing.forms.setValue({ kind: 'fqn', name: 'group.total' }, { type: 'text', value: 'delta' });
      artifact = new Uint8Array(await editing.downloadLayer!());
    } finally {
      await editing.close();
    }
    const doc = await engine.open({ kind: 'layerFile', id: 'file-verbatim', basePath, layer: { kind: 'artifact', bytes: artifact } }, { scope: ['*'] });
    try {
      const target = join(dir, 'verbatim.pdf');
      await doc.downloadToFile!(target);
      const written = await readFile(target);
      const downloaded = new Uint8Array(await doc.download());
      expect(sha256(new Uint8Array(written))).toBe(sha256(downloaded));
      expect(written.byteLength).toBeGreaterThan((await stat(basePath)).size);
    } finally {
      await doc.close();
    }
  });
});
