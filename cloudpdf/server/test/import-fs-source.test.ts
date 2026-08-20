/**
 * Filesystem import source: shared conformance over a real tmpdir,
 * plus the containment surface — key-shape rejections, the
 * symlink-escape defense (THE security-critical test of this
 * adapter), and the structural api-token-only invariant.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { FsImportSource } from '../src/import/adapters/FsImportSource';
import {
  ImportConnectionSchema,
  type FsImportConnection,
} from '../src/import/config/ImportConnectionSchema';
import { ImportPolicySchema, type ImportPolicy } from '../src/import/config/ImportPolicySchema';
import { ImportSourceError } from '../src/import/ImportSource';
import { runImportSourceConformance } from './_helpers/import-source-conformance';

let root: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'embedpdf-fs-import-root-'));
  outside = await mkdtemp(join(tmpdir(), 'embedpdf-fs-import-outside-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

function fsConn(r: string): FsImportConnection {
  return ImportConnectionSchema.parse({ kind: 'fs', id: 'drop', root: r }) as FsImportConnection;
}

function policyFor(maxBytes?: number): ImportPolicy {
  return ImportPolicySchema.parse(maxBytes === undefined ? {} : { maxBytes });
}

function sourceFor(key: string, opts: { revision?: string; maxBytes?: number } = {}): FsImportSource {
  return new FsImportSource({
    connection: fsConn(root),
    key,
    revision: opts.revision,
    policy: policyFor(opts.maxBytes),
  });
}

async function openErr(key: string): Promise<ImportSourceError> {
  const err = await sourceFor(key)
    .open({ signal: new AbortController().signal })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImportSourceError);
  return err as ImportSourceError;
}

runImportSourceConformance('fs', () => ({
  async seed(name, bytes) {
    const abs = join(root, name);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  },
  source(name, opts) {
    return sourceFor(name, { ...(opts?.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}) });
  },
  missingName: () => 'definitely-missing.pdf',
}));

describe('FsImportSource containment', () => {
  test('key-shape violations are refused before touching the disk', () => {
    expect(() => sourceFor('/etc/passwd')).toThrowError(/relative to the connection root/);
    expect(() => sourceFor('a/../b.pdf')).toThrowError(/'\.' or '\.\.' segments/);
    expect(() => sourceFor('a//b.pdf')).toThrowError(/segments/);
    expect(() => sourceFor('a\\b.pdf')).toThrowError(/forward slashes/);
  });

  test('revisions are refused — pin with expected.sha256 instead', () => {
    expect(() => sourceFor('a.pdf', { revision: 'v1' })).toThrowError(/expected\.sha256/);
  });

  test('a symlink inside the root pointing OUTSIDE it is refused', async () => {
    await writeFile(join(outside, 'secret.pdf'), '%PDF outside bytes');
    await symlink(join(outside, 'secret.pdf'), join(root, 'sneaky-link.pdf'));
    const err = await openErr('sneaky-link.pdf');
    expect(err.code).toBe('denied');
    expect(err.message).toMatch(/escapes the connection root/);
  });

  test('a symlink that stays inside the root is allowed', async () => {
    await writeFile(join(root, 'real.pdf'), '%PDF inside bytes');
    await symlink(join(root, 'real.pdf'), join(root, 'alias.pdf'));
    const opened = await sourceFor('alias.pdf').open({ signal: new AbortController().signal });
    expect(opened.contentLength).toBe(17);
  });

  test('directories are refused', async () => {
    await mkdir(join(root, 'some-dir'), { recursive: true });
    const err = await openErr('some-dir');
    expect(err.code).toBe('unsupported');
    expect(err.message).toMatch(/regular file/);
  });

  test('fs connections are structurally api-token only', () => {
    const res = ImportConnectionSchema.safeParse({
      kind: 'fs',
      id: 'drop',
      root: '/srv/inbox',
      credentials: ['api-token', 'tenant-jwt'],
      scope: { kind: 'tenant-template', template: 'tenants/{tenantId}/' },
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.success ? [] : res.error.issues)).toContain(
      'filesystem connections are api-token only',
    );
  });

  test('relative roots are refused at parse', () => {
    const res = ImportConnectionSchema.safeParse({ kind: 'fs', id: 'drop', root: 'relative/dir' });
    expect(res.success).toBe(false);
  });
});
