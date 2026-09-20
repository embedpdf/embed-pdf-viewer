import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { createSqliteDb } from '../src/db/drivers/sqlite';
import { sqliteMigrations } from '../src/db/migrations/sqlite';
import { migrate } from '../src/db/migrator/runner';
import { PdfPasswordSessionsRepo } from '../src/db/repos/pdf_password_sessions.repo';
import { KmsAadMismatch } from '../src/security/kms/KmsKeyring';
import { StaticKmsKeyring } from '../src/security/kms/adapters/StaticKmsKeyring';
import {
  decryptPasswordSession,
  encryptPasswordSession,
  type PasswordSessionBinding,
} from '../src/security/password-session';

const binding: PasswordSessionBinding = {
  tenantId: 'tenant-1',
  docId: 'doc-1',
  layerName: 'default',
  sub: 'alice',
  jwtJti: 'token-1',
  baseSha: 'a'.repeat(64),
  securityFingerprint: 'security-1',
};

function createContext() {
  return {
    binding,
    unlockKey: randomBytes(32).toString('base64url'),
    serverSecret: { id: 'server-1', secret: randomBytes(32) },
    keyring: new StaticKmsKeyring({ keyId: 'kms-1', kek: randomBytes(32) }),
  };
}

describe('password session key separation', () => {
  test('requires the JWT unlock key, server secret, and KMS key to recover the PDF password', async () => {
    const context = createContext();
    const encrypted = await encryptPasswordSession({ ...context, password: 'document-passphrase' });

    await expect(decryptPasswordSession({ ...context, encrypted })).resolves.toBe(
      'document-passphrase',
    );
    for (const changed of [
      { ...context, unlockKey: randomBytes(32).toString('base64url') },
      { ...context, serverSecret: { ...context.serverSecret, secret: randomBytes(32) } },
      { ...context, keyring: new StaticKmsKeyring({ keyId: 'kms-1', kek: randomBytes(32) }) },
    ]) {
      await expect(decryptPasswordSession({ ...changed, encrypted })).rejects.toThrow(
        KmsAadMismatch,
      );
    }
  });

  test.each(Object.keys(binding) as (keyof PasswordSessionBinding)[])(
    'rejects a session transplanted to another %s',
    async (field) => {
      const context = createContext();
      const encrypted = await encryptPasswordSession({
        ...context,
        password: 'document-passphrase',
      });
      await expect(
        decryptPasswordSession({
          ...context,
          encrypted,
          binding: { ...binding, [field]: `${binding[field]}-changed` },
        }),
      ).rejects.toThrow(KmsAadMismatch);
    },
  );

  test('rebinds a persisted session to a signed base with the same JWT unlock key', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const context = createContext();
      const repo = new PdfPasswordSessionsRepo(db, {
        keyring: context.keyring,
        serverSecrets: [context.serverSecret],
      });
      const now = Date.now();
      await repo.upsertFromPassword({
        binding,
        unlockKey: context.unlockKey,
        password: 'document-passphrase',
        facts: {
          openedAs: 'owner',
          pdfPermissionsBits: 0,
          pdfPermissionsAllAllowed: true,
          securityHandlerRevision: 6,
        },
        activeExpiresAt: now + 60_000,
        renewableUntil: now + 120_000,
      });
      const nextBinding = { ...binding, baseSha: 'b'.repeat(64) };

      await expect(
        db
          .transaction()
          .execute((trx) =>
            repo.rebind(trx, binding, nextBinding, randomBytes(32).toString('base64url'), now),
          ),
      ).rejects.toThrow(KmsAadMismatch);
      await expect(repo.decryptActivePassword(binding, context.unlockKey, now)).resolves.toBe(
        'document-passphrase',
      );

      await expect(
        db
          .transaction()
          .execute((trx) => repo.rebind(trx, binding, nextBinding, context.unlockKey, now)),
      ).resolves.toBe(true);
      await expect(repo.decryptActivePassword(binding, context.unlockKey, now)).resolves.toBeNull();
      await expect(repo.decryptActivePassword(nextBinding, context.unlockKey, now)).resolves.toBe(
        'document-passphrase',
      );
      await expect(
        repo.decryptActivePassword(nextBinding, randomBytes(32).toString('base64url'), now),
      ).rejects.toThrow(KmsAadMismatch);
      expect(await db.selectFrom('pdf_password_sessions').selectAll().execute()).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});
