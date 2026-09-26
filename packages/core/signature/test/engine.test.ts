import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import { EngineErrorCode, type Engine } from '@embedpdf/engine-core/runtime';
import { createTestSigner, sign, validateSignatures, type TestSigner } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const DUMP_DIR = process.env.EPDF_SIG_DUMP_DIR;

describe('sign() and validateSignatures() over the local engine', () => {
  let engine: Engine;
  let signer: TestSigner;
  let bytes: Uint8Array;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    signer = await createTestSigner({ commonName: 'EmbedPDF test signer' });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
    if (DUMP_DIR)
      await writeFile(resolve(DUMP_DIR, 'core_signature_test_signer.der'), signer.certificate);
  });
  afterAll(async () => {
    await engine.destroy();
  });

  test('one call signs a field with a CAdES-B signature the engine and the validator both accept', async () => {
    const doc = await engine.open({ kind: 'bytes', id: 'cades', bytes });
    try {
      await doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'agreed' },
      );
      const result = await sign(doc, {
        field: { kind: 'fqn', name: 'sig' },
        key: signer,
        lock: { action: 'include', fields: ['group.total'] },
      });
      expect(result.status).toBe('completed');
      expect(result.signature.subFilter).toBe('ETSI.CAdES.detached');
      expect(result.signature.coverage).toBe('whole-revision');

      const [verdict] = await validateSignatures(doc, {
        trust: { anchors: async () => [signer.certificate] },
      });
      expect(verdict.integrity).toBe('valid');
      expect(verdict.cryptography).toBe('valid');
      expect(verdict.trust).toBe('trusted');
      expect(verdict.modifications.verdict).toBe('unchanged');
      expect(verdict.summary).toBe('valid');
      expect(verdict.cms?.signingCertificateV2).toBe(true);
      expect(verdict.cms?.signingTime).toBeNull();

      const [untrusted] = await validateSignatures(doc);
      expect(untrusted.trust).toBe('unknown');
      expect(untrusted.summary).toBe('valid-untrusted');

      // The locked field refuses writes.
      await expect(
        doc.forms.setValue(
          { kind: 'fqn', name: 'group.total' },
          { type: 'text', value: 'changed' },
        ),
      ).rejects.toMatchObject({ code: 'ProtectedDocument' });

      if (DUMP_DIR)
        await writeFile(resolve(DUMP_DIR, 'core_signature_cades.pdf'), await doc.download());
    } finally {
      await doc.close();
    }
  });

  test('a PKCS#7 certification signs with signing-time and protects the document', async () => {
    const doc = await engine.open({ kind: 'bytes', id: 'pkcs7', bytes });
    try {
      const result = await sign(doc, {
        field: { kind: 'fqn', name: 'sig' },
        key: signer,
        subFilter: 'adbe.pkcs7.detached',
        certify: { permission: 2 },
      });
      expect(result.signature.catalogCertification).toBe(true);
      expect(result.protection.enforced).toBe('fill');
      expect(result.protection.judged).toBe('fill');
      const [verdict] = await validateSignatures(doc, {
        trust: { anchors: async () => [signer.certificate] },
      });
      expect(verdict.summary).toBe('valid');
      expect(verdict.cms?.signingTime).toBeInstanceOf(Date);
      // A fill after the certification: bytes stay intact, the verdict is honest about the later revision.
      await doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'filled' },
      );
      const [after] = await validateSignatures(doc, {
        trust: { anchors: async () => [signer.certificate] },
      });
      expect(after.integrity).toBe('valid');
      expect(after.modifications.verdict).toBe('unchanged'); // unsaved edits are not a revision
      const reopened = await engine.open({
        kind: 'bytes',
        id: 'pkcs7-reopen',
        bytes: await doc.download(),
      });
      try {
        const [later] = await validateSignatures(reopened, {
          trust: { anchors: async () => [signer.certificate] },
        });
        expect(later.integrity).toBe('valid');
        expect(later.cryptography).toBe('valid');
        // The revision analysis explains the fill: a permitted change under permission 2.
        expect(later.modifications.verdict).toBe('permitted');
        expect(later.summary).toBe('valid');
        if (DUMP_DIR)
          await writeFile(
            resolve(DUMP_DIR, 'core_signature_pkcs7_filled.pdf'),
            await reopened.download(),
          );
      } finally {
        await reopened.close();
      }
    } finally {
      await doc.close();
    }
  });

  for (const algorithm of ['RSA-PSS', 'ECDSA'] as const) {
    test(`${algorithm}: the engine accepts the CMS and the verdict is valid`, async () => {
      const alt = await createTestSigner({ commonName: `EmbedPDF ${algorithm} signer`, algorithm });
      const doc = await engine.open({ kind: 'bytes', id: `alg-${algorithm}`, bytes });
      try {
        const result = await sign(doc, { field: { kind: 'fqn', name: 'sig' }, key: alt });
        expect(result.status).toBe('completed');
        const [verdict] = await validateSignatures(doc, {
          trust: { anchors: async () => [alt.certificate] },
        });
        expect(verdict.summary).toBe('valid');
        if (DUMP_DIR) {
          await writeFile(
            resolve(DUMP_DIR, `core_signature_${algorithm}.pdf`),
            await doc.download(),
          );
          await writeFile(resolve(DUMP_DIR, `core_signature_${algorithm}.der`), alt.certificate);
        }
      } finally {
        await doc.close();
      }
    });
  }

  test('a signer that returns the wrong CMS never reaches the document', async () => {
    const doc = await engine.open({ kind: 'bytes', id: 'bad-signer', bytes });
    try {
      const other = await createTestSigner({ commonName: 'wrong digest' });
      await expect(
        sign(doc, {
          field: { kind: 'fqn', name: 'sig' },
          key: {
            kind: 'cms',
            sign: async () => {
              const { buildDetachedCms } = await import('../src/index');
              return buildDetachedCms({
                digest: new Uint8Array(32),
                hash: 'sha256',
                profile: 'cades-b',
                signer: other,
              });
            },
          },
        }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.SignatureRefused,
        details: { reason: 'digest-mismatch' },
      });
      const snapshot = await doc.signatures.list();
      expect(snapshot.signatures[0].signed).toBe(false);
      // The candidate was cancelled: the document is writable again.
      await doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'still free' },
      );
    } finally {
      await doc.close();
    }
  });
});
