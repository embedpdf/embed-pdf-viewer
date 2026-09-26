/**
 * The session-less half of a durable signing (`signatures.finalizeCandidate`):
 * a candidate prepared on one worker is rebuilt from base ⊕ tail elsewhere,
 * the CMS is installed into the rebuilt file, and the result is read back
 * through the ordinary signature model before it becomes a version. Drives
 * the WorkerHost directly (native runtime; skipped when it is not built).
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type {
  WirePack,
  WorkerRequest,
  WorkerResponse,
  WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { WorkerHost } from '../../services/src/worker-host/WorkerHost';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);
const CONTENTS_SIZE = 512;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

let host: WorkerHost | null = null;
let dir: string;
let basePath: string;
let nextJob = 1;
const pending = new Map<number, { resolve: (r: WorkerResultPayload) => void; reject: (e: unknown) => void }>();

function call<T extends WorkerResultPayload['tag']>(
  req: Omit<Extract<WorkerRequest, { jobId: number }>, 'jobId'>,
  tag: T,
): Promise<Extract<WorkerResultPayload, { tag: T }>> {
  const jobId = nextJob++;
  return new Promise((resolve, reject) => {
    pending.set(jobId, {
      resolve: (r) => {
        if (r.tag !== tag) reject(new Error(`unexpected ${r.tag}`));
        else resolve(r as Extract<WorkerResultPayload, { tag: T }>);
      },
      reject,
    });
    host!.receive({ ...req, jobId } as WorkerRequest);
  });
}

async function rejects(req: Parameters<typeof call>[0], code: string, message?: RegExp): Promise<void> {
  let error: { code?: string; message?: string } | null = null;
  try {
    await call(req, 'signatures.finalizeCandidate');
  } catch (e) {
    error = e as { code?: string; message?: string };
  }
  expect(error, 'expected a rejection').not.toBeNull();
  expect(error!.code).toBe(code);
  if (message) expect(error!.message).toMatch(message);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'epdf-finalize-'));
  basePath = join(dir, 'base.pdf');
  await copyFile(resolve(here, 'fixtures', 'unsigned_sigfield.pdf'), basePath);
  try {
    const runtime = await createPdfRuntime({ prefer: 'native' });
    host = new WorkerHost(
      runtime,
      (pack: WirePack<WorkerResponse>) => {
        const msg = pack.payload;
        const p = pending.get(msg.jobId);
        if (!p) return;
        pending.delete(msg.jobId);
        if (msg.kind === 'resolve') p.resolve(msg.result);
        else p.reject(msg.error);
      },
      { signingCandidatePath: (_base, signingId) => join(dir, `${signingId}.candidate.pdf`) },
    );
  } catch (error) {
    if (!/native Node runtime|Native runtime/.test(String(error))) throw error;
    console.warn('finalize-candidate tests skipped: native runtime unavailable');
  }
});
afterAll(async () => {
  if (host) await call({ kind: 'shutdown' } as never, 'shutdown' as never).catch(() => undefined);
});

describe('signatures.finalizeCandidate', () => {
  test('rebuilt base ⊕ tail finalizes to the version the prepare sealed', async () => {
    if (!host) return;
    await call(
      { kind: 'open.layerFileBase', docId: 'sign', baseKey: 'base', basePath, layer: { kind: 'fresh' }, password: null },
      'open',
    );
    const before = await call({ kind: 'signatures.list', docId: 'sign' }, 'signatures.list');
    const field = before.snapshot.signatures.find((s) => s.fieldName === 'sig')!;
    expect(field.signed).toBe(false);
    const fieldObjectNumber = field.field.kind === 'objectNumber' ? field.field.fieldObjectNumber : -1;
    expect(fieldObjectNumber).toBeGreaterThan(0);

    const { result: prepared } = await call(
      {
        kind: 'signatures.prepare',
        docId: 'sign',
        input: { field: { kind: 'fqn', name: 'sig' }, certify: { permission: 2 }, contentsSize: CONTENTS_SIZE },
      },
      'signatures.prepare',
    );
    expect(prepared.contentsSize).toBe(CONTENTS_SIZE);

    // What a server keeps: the candidate's TAIL past the base's length.
    const candidatePath = join(dir, `${prepared.signingId}.candidate.pdf`);
    const base = await readFile(basePath);
    const candidate = await readFile(candidatePath);
    expect(candidate.subarray(0, base.byteLength).equals(base)).toBe(true);
    const tail = candidate.subarray(base.byteLength);
    expect(tail.byteLength).toBeGreaterThan(0);

    // The preparing worker forgets the signing; another replica rebuilds it.
    const aborted = await call({ kind: 'signatures.abort', docId: 'sign', signingId: prepared.signingId }, 'signatures.abort');
    expect(aborted.result.status).toBe('aborted');
    await expect(stat(candidatePath)).rejects.toThrow();
    const rebuilt = join(dir, 'rebuilt.pdf');
    await writeFile(rebuilt, Buffer.concat([base, tail]));

    const finalized = await call(
      {
        kind: 'signatures.finalizeCandidate',
        path: rebuilt,
        byteRange: prepared.byteRange,
        contentsSize: prepared.contentsSize,
        fieldObjectNumber,
        cms: FAKE_CMS.buffer.slice(0),
        password: null,
      },
      'signatures.finalizeCandidate',
    );
    expect(finalized.signature.signed).toBe(true);
    expect(finalized.signature.coverage).toBe('whole-revision');
    expect(finalized.signature.byteRange).toEqual(prepared.byteRange);
    expect(finalized.signature.docMdp).toBe(2);
    expect(finalized.signature.catalogCertification).toBe(true);
    expect(finalized.signature.contentsSize).toBe(FAKE_CMS.byteLength);
    expect(finalized.protection.certification?.permission).toBe(2);

    // The version IS the file: its own hash and length.
    const sealed = await readFile(rebuilt);
    expect(finalized.version).toEqual({ sha256: sha256(sealed), byteLength: sealed.byteLength });
    // The prepare's digest is the digest of the finalized file's ranges:
    // installing the CMS changed nothing the signature covers.
    const [r0, r1, r2, r3] = prepared.byteRange;
    const ranges = Buffer.concat([sealed.subarray(r0, r0 + r1), sealed.subarray(r2, r2 + r3)]);
    expect(sha256(ranges)).toBe(hex(prepared.digest));
    // The hole holds the CMS in hex, zero-padded to the reservation.
    const hole = sealed.subarray(r1, r2).toString('latin1');
    expect(hole.startsWith(`<${hex(FAKE_CMS)}`)).toBe(true);
    expect(hole.endsWith('>')).toBe(true);
    expect(hole.length).toBe(2 * CONTENTS_SIZE + 2);

    // The sealed file opens as an ordinary signed document.
    await call(
      { kind: 'open.layerFileBase', docId: 'verify', baseKey: 'sealed', basePath: rebuilt, layer: { kind: 'fresh' }, password: null },
      'open',
    );
    const after = await call({ kind: 'signatures.list', docId: 'verify' }, 'signatures.list');
    expect(after.snapshot.chainValid).toBe(true);
    expect(after.snapshot.revisions).toHaveLength(before.snapshot.revisions.length + 1);
    const sig = after.snapshot.signatures.find((s) => s.fieldName === 'sig')!;
    expect(sig.revisionIndex).toBe(after.snapshot.revisions.length - 1);
    const contents = await call(
      { kind: 'signatures.contents', docId: 'verify', ref: { kind: 'objectNumber', fieldObjectNumber } },
      'signatures.contents',
    );
    expect(new Uint8Array(contents.bytes)).toEqual(FAKE_CMS);
    const version = await call({ kind: 'document.version', docId: 'verify' }, 'document.version');
    expect(version.version).toEqual(finalized.version);
    await call({ kind: 'close', docId: 'verify' }, 'close');

    // Finalizing the same file with the same CMS again writes the same bytes.
    const again = await call(
      {
        kind: 'signatures.finalizeCandidate',
        path: rebuilt,
        byteRange: prepared.byteRange,
        contentsSize: prepared.contentsSize,
        fieldObjectNumber,
        cms: FAKE_CMS.buffer.slice(0),
        password: null,
      },
      'signatures.finalizeCandidate',
    );
    expect(again.version).toEqual(finalized.version);

    // What it refuses, on fresh rebuilds so a refusal never leaves a half-patched file behind.
    const fresh = async (name: string) => {
      const p = join(dir, name);
      await writeFile(p, Buffer.concat([base, tail]));
      return p;
    };
    const input = (path: string) => ({
      kind: 'signatures.finalizeCandidate' as const,
      path,
      byteRange: prepared.byteRange,
      contentsSize: prepared.contentsSize,
      fieldObjectNumber,
      cms: FAKE_CMS.buffer.slice(0),
      password: null,
    });
    const p1 = await fresh('r1.pdf');
    await rejects({ ...input(p1), byteRange: [r0, r1, r2, r3 + 1] }, 'InvalidArg', /does not span/);
    await rejects({ ...input(p1), contentsSize: CONTENTS_SIZE - 1 }, 'InvalidArg', /hex digits/);
    await rejects({ ...input(p1), byteRange: [r0, r1 + 1, r2 + 1, r3 - 1] }, 'InvalidArg', /Contents hole/);
    await rejects({ ...input(p1), cms: new Uint8Array(CONTENTS_SIZE + 1).fill(0x30).buffer }, 'SignatureRefused', /does not fit/);
    await rejects({ ...input(p1), cms: new Uint8Array([0x04, 1, 1]).buffer }, 'SignatureRefused', /DER SEQUENCE/);
    // Nothing above touched the file.
    expect((await readFile(p1)).equals(Buffer.concat([base, tail]))).toBe(true);
    // A wrong field: the bytes carry the signature on another object.
    await rejects({ ...input(p1), fieldObjectNumber: fieldObjectNumber + 1 }, 'SignatureRefused', /lost the signature field/);
    // A tampered rebuild: a byte appended past what the prepare sealed.
    const p2 = await fresh('r2.pdf');
    await writeFile(p2, Buffer.concat([base, tail, Buffer.from('\n')]));
    await rejects(input(p2), 'InvalidArg', /does not span/);

    await call({ kind: 'close', docId: 'sign' }, 'close');
  });
});
