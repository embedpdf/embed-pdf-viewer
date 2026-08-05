/**
 * Standard symmetric-bootstrap recipe: secrets registry → resolver
 * → individual family factories. Replaces the deleted
 * `createSecurityRuntime` bundler with the composable pattern users
 * should follow in their own entrypoints (Docker, custom servers,
 * tests, etc.).
 */
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { describe, expect, test } from 'vitest';

import {
  createKmsKeyring,
  createSecretResolver,
  createSecretsProviderRegistry,
  LocalAesGcmEnvelope,
} from '../src/index';

describe('symmetric bootstrap of secrets + kms', () => {
  test('static KMS resolves its KEK via the injected resolver; user code can use the same providers for its own secrets', async () => {
    const env = {
      CLOUDPDF_STATIC_KMS_KEK: Buffer.alloc(32, 9).toString('base64'),
      APP_JWT_SECRET: 'demo-jwt-secret',
      APP_JSON_SECRET: JSON.stringify({ answer: 42 }),
    };

    // 1. Secrets — primary, user-facing utility. Stays out of buildApp.
    //    Registry takes the full SecretsConfig and applies CachingSecretsProvider
    //    automatically when `cache` is present.
    const providers = createSecretsProviderRegistry(
      { providers: { env: { kind: 'env' } }, cache: { ttlSec: 60 } },
      { env },
    );
    const resolver = createSecretResolver(providers);

    // 2. Each family takes the resolver via opts. KMS resolves its
    //    static KEK internally — no special "createSecurityRuntime"
    //    bundler needed.
    const kms = await createKmsKeyring(
      {
        kind: 'static',
        keyId: 'static-dev',
        kek: { provider: 'env', name: 'CLOUDPDF_STATIC_KMS_KEK', encoding: 'base64' },
      },
      { resolver },
    );

    // 3. User code can use the same providers/resolver for its own
    //    deployment secrets — JWT keys, third-party API tokens,
    //    feature config blobs, etc.
    const userSecrets = await resolver.resolve({
      jwtSecretBuffer: { provider: 'env', name: 'APP_JWT_SECRET' },
      jwtSecretString: {
        ref: { provider: 'env', name: 'APP_JWT_SECRET' },
        as: 'string',
      },
      appConfig: {
        ref: { provider: 'env', name: 'APP_JSON_SECRET' },
        as: 'json',
        schema: z.object({ answer: z.number() }),
      },
    });

    expect(Buffer.isBuffer(userSecrets.jwtSecretBuffer)).toBe(true);
    expect(userSecrets.jwtSecretBuffer.toString('utf8')).toBe('demo-jwt-secret');
    expect(userSecrets.jwtSecretString).toBe('demo-jwt-secret');
    expect(userSecrets.appConfig).toEqual({ answer: 42 });

    // KMS works end-to-end (encrypt/decrypt round-trip).
    const blob = await LocalAesGcmEnvelope.encrypt(Buffer.from('payload'), kms, {
      tenantId: 'tenant-a',
    });
    const roundTrip = await LocalAesGcmEnvelope.decrypt(blob, kms, {
      tenantId: 'tenant-a',
    });
    expect(roundTrip.toString('utf8')).toBe('payload');
  });

  test('static KMS without a resolver throws a helpful error', async () => {
    await expect(
      createKmsKeyring({
        kind: 'static',
        keyId: 'static-dev',
        kek: { provider: 'env', name: 'CLOUDPDF_STATIC_KMS_KEK' },
      }),
    ).rejects.toThrow(/static KMS requires opts\.resolver/);
  });

  test('kms info exposes public diagnostics only', async () => {
    const env = { CLOUDPDF_STATIC_KMS_KEK: Buffer.alloc(32, 1).toString('base64') };
    const providers = createSecretsProviderRegistry(
      { providers: { env: { kind: 'env' } } },
      { env },
    );
    const resolver = createSecretResolver(providers);

    const kms = await createKmsKeyring(
      {
        kind: 'static',
        keyId: 'my-static-key',
        kek: { provider: 'env', name: 'CLOUDPDF_STATIC_KMS_KEK', encoding: 'base64' },
      },
      { resolver },
    );

    expect(kms.info).toEqual({ kind: 'static', keyId: 'my-static-key' });
    // No secret material in info
    expect(JSON.stringify(kms.info)).not.toContain(
      Buffer.alloc(32, 1).toString('base64').slice(0, 8),
    );
  });
});
