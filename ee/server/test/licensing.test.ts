import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createSqliteDb } from '../src/db/drivers/sqlite';
import { sqliteMigrations } from '../src/db/migrations/sqlite';
import { migrate } from '../src/db/migrator/runner';
import { validateConnectedLicense } from '../src/licensing/connected-client';
import { LicenseRuntime } from '../src/licensing/LicenseRuntime';
import { verifyMachineCertificate } from '../src/licensing/offline-certificate';
import type { CloudPdfLicenseIdentity } from '../src/licensing/product';
import { UsageLimitError, UsageMeters } from '../src/licensing/UsageMeters';
import type { LicenseGate } from '../src/licensing/LicenseRuntime';
import { ConnectedUsageReporter } from '../src/licensing/ConnectedUsageReporter';
import { LicenseStateRepository } from '../src/licensing/LicenseStateRepository';
import { buildApp } from '../src/app/buildApp';

const accountId = 'account-test';
const productId = 'product-test';

function createSigningIdentity(): {
  identity: CloudPdfLicenseIdentity;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    identity: {
      accountId,
      apiUrl: 'https://keygen.example',
      productId,
      publicKeyHex: publicDer.subarray(-32).toString('hex'),
    },
    privateKey,
  };
}

function machineCertificate(input: {
  expiry?: Date;
  fingerprint: string;
  issued?: Date;
  metadata?: Record<string, unknown>;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}): string {
  const payload = {
    data: {
      attributes: { fingerprint: input.fingerprint },
      id: 'machine-id',
      relationships: {
        account: { data: { id: accountId, type: 'accounts' } },
        license: { data: { id: 'license-id', type: 'licenses' } },
      },
      type: 'machines',
    },
    included: [
      {
        attributes: {
          expiry: '2030-01-01T00:00:00.000Z',
          metadata: input.metadata ?? {},
          status: 'ACTIVE',
        },
        id: 'license-id',
        relationships: {
          product: { data: { id: productId, type: 'products' } },
        },
        type: 'licenses',
      },
    ],
    meta: {
      expiry: (input.expiry ?? new Date('2029-02-01T00:00:00.000Z')).toISOString(),
      issued: (input.issued ?? new Date('2029-01-01T00:00:00.000Z')).toISOString(),
    },
  };
  const enc = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = sign(null, Buffer.from(`machine/${enc}`), input.privateKey).toString('base64');
  const envelope = Buffer.from(
    JSON.stringify({ alg: 'base64+ed25519', enc, sig }),
  ).toString('base64');
  return `-----BEGIN MACHINE FILE-----\n${envelope}\n-----END MACHINE FILE-----`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('air-gapped machine certificates', () => {
  test('verifies signature, product, deployment binding, and embedded limits', () => {
    const { identity, privateKey } = createSigningIdentity();
    const certificate = machineCertificate({
      fingerprint: 'deployment-fingerprint',
      metadata: {
        meters: [
          {
            enforcement: 'notify-only',
            limit: '100',
            metric: 'pdf.views',
            period: 'month',
            warningThresholds: [80, 90, 100],
          },
        ],
      },
      privateKey,
    });

    const result = verifyMachineCertificate({
      certificate,
      expectedFingerprint: 'deployment-fingerprint',
      identity,
      now: new Date('2029-01-15T00:00:00.000Z'),
    });

    expect(result.licenseId).toBe('license-id');
    expect(result.metadata['meters']).toEqual([
      expect.objectContaining({ metric: 'pdf.views', limit: '100' }),
    ]);
  });

  test('rejects copied, tampered, and expired certificates', () => {
    const { identity, privateKey } = createSigningIdentity();
    const certificate = machineCertificate({
      expiry: new Date('2029-01-10T00:00:00.000Z'),
      fingerprint: 'deployment-a',
      privateKey,
    });

    expect(() => verifyMachineCertificate({
      certificate,
      expectedFingerprint: 'deployment-b',
      identity,
      now: new Date('2029-01-05T00:00:00.000Z'),
    })).toThrow(/another deployment/);
    expect(() => verifyMachineCertificate({
      certificate: certificate.replace('MACHINE FILE', 'MACHINE FILF'),
      expectedFingerprint: 'deployment-a',
      identity,
      now: new Date('2029-01-05T00:00:00.000Z'),
    })).toThrow(/invalid envelope/);
    expect(() => verifyMachineCertificate({
      certificate,
      expectedFingerprint: 'deployment-a',
      identity,
      now: new Date('2029-01-11T00:00:00.000Z'),
    })).toThrow(/expired/);
  });

  test('accepts a certificate signed by an embedded previous verification key', () => {
    const previous = createSigningIdentity();
    const current = createSigningIdentity();
    const certificate = machineCertificate({
      fingerprint: 'deployment-fingerprint',
      privateKey: previous.privateKey,
    });

    const result = verifyMachineCertificate({
      certificate,
      expectedFingerprint: 'deployment-fingerprint',
      identity: {
        ...current.identity,
        previousPublicKeyHexes: [previous.identity.publicKeyHex],
      },
      now: new Date('2029-01-15T00:00:00.000Z'),
    });

    expect(result.licenseId).toBe('license-id');
  });
});

test('connected validation activates a deployment and then revalidates', async () => {
  const { identity } = createSigningIdentity();
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  let validations = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? 'GET',
      url: String(url),
    });
    if (String(url).endsWith('/licenses/actions/validate-key')) {
      validations += 1;
      return Response.json({
        data: {
          attributes: {
            expiry: '2029-02-01T00:00:00.000Z',
            metadata: { offlineGraceHours: 72 },
          },
          id: 'license-id',
          type: 'licenses',
        },
        meta: {
          code: validations === 1 ? 'NO_MACHINES' : 'VALID',
          valid: validations > 1,
        },
      });
    }
    return Response.json({
      data: {
        attributes: { fingerprint: 'deployment-fingerprint' },
        id: 'machine-id',
        type: 'machines',
      },
    }, { status: 201 });
  }));

  const validation = await validateConnectedLicense({
    fingerprint: 'deployment-fingerprint',
    identity,
    key: 'license-key',
  });

  expect(validation.code).toBe('VALID');
  expect(requests.map((request) => request.method)).toEqual(['POST', 'POST', 'POST']);
  expect(requests[1]?.body).toEqual(expect.objectContaining({
    data: expect.objectContaining({
      attributes: expect.objectContaining({ fingerprint: 'deployment-fingerprint' }),
    }),
  }));
});

test('installs an air-gap certificate against the stable database deployment identity', async () => {
  const { identity, privateKey } = createSigningIdentity();
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const env = {
    CLOUDPDF_KEYGEN_ACCOUNT_ID: identity.accountId,
    CLOUDPDF_KEYGEN_PRODUCT_ID: identity.productId,
    CLOUDPDF_KEYGEN_PUBLIC_KEY: identity.publicKeyHex,
    CLOUDPDF_LICENSE_MODE: 'air-gapped',
    NODE_ENV: 'test',
  };
  const runtime = await LicenseRuntime.create({ db, env, startTimer: false });
  try {
    const request = await runtime.createActivationRequest();
    const certificate = machineCertificate({
      expiry: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      fingerprint: request.fingerprint,
      issued: new Date(Date.now() - 60_000),
      metadata: {
        metersJson: JSON.stringify([{
          enforcement: 'hard-limit',
          limit: '100',
          metric: 'pdf.views',
          period: 'month',
          warningThresholds: [80, 90, 100],
        }]),
        purpose: 'development',
        telemetryProfile: 'none',
      },
      privateKey,
    });
    await runtime.installCertificate(certificate);
    expect(runtime.getStatus()).toEqual(expect.objectContaining({
      access: 'full',
      code: 'VALID',
      licenseKind: 'development',
      mode: 'air-gapped',
      meters: [expect.objectContaining({ metric: 'pdf.views', limit: '100' })],
      telemetryProfile: 'none',
    }));
  } finally {
    await runtime.close();
    await db.destroy();
  }
});

test('stores deployment usage locally and enforces hard counter limits atomically', async () => {
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const gate: LicenseGate = {
    getStatus: () => ({
      access: 'full',
      code: 'VALID',
      expiresAt: null,
      lastValidatedAt: new Date().toISOString(),
      licenseKind: null,
      message: 'test',
      meters: [{
        enforcement: 'hard-limit',
        limit: '1',
        metric: 'pdf.views',
        period: 'month',
        warningThresholds: [80, 100],
      }],
      mode: 'air-gapped',
      telemetryProfile: 'none',
    }),
  };
  const meters = new UsageMeters(db, gate);
  try {
    await expect(meters.recordView()).resolves.toBe(1);
    await expect(meters.recordView()).rejects.toBeInstanceOf(UsageLimitError);
    await expect(meters.recordUpload('doc-one')).resolves.toBe(1);
    await expect(meters.recordUpload('doc-one')).resolves.toBe(1);
    const snapshot = await meters.snapshot();
    expect(snapshot.metrics['pdf.views']).toBe(1);
    expect(snapshot.metrics['pdf.uploads']).toBe(1);
  } finally {
    await db.destroy();
  }
});

test('connected reporting retries the persisted sequence and payload after a failed response', async () => {
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const repository = new LicenseStateRepository(db);
  const state = await repository.getOrCreate();
  await db
    .updateTable('license_runtime_state')
    .set({
      validation_data_json: JSON.stringify({
        metadata: { cloudpdfLicenseId: 'license-record-id' },
      }),
    })
    .where('singleton_id', '=', 1)
    .execute();
  const gate: LicenseGate = {
    getStatus: () => ({
      access: 'full',
      code: 'VALID',
      expiresAt: null,
      lastValidatedAt: new Date().toISOString(),
      licenseKind: null,
      message: 'test',
      meters: [],
      mode: 'connected',
      telemetryProfile: 'aggregated-usage',
    }),
  };
  const meters = new UsageMeters(db, gate);
  await meters.recordView();
  const requests: Array<{ authorization: string | null; body: Record<string, unknown> }> = [];
  let responseStatus = 400;
  vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      authorization: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response('', { status: responseStatus });
  }));
  const reporter = await ConnectedUsageReporter.create({
    controlPlaneUrl: 'https://accounts.example.test',
    db,
    meters,
    reportingToken: 'reporting-secret',
  });

  try {
    await expect(reporter.reportNow()).rejects.toThrow(/returned 400/);
    const failed = await reporter.status();
    expect(failed.pendingReport?.payload.sequence).toBe(1);
    expect(failed.pendingReport?.payload.installationId).toBe(state.deployment_id);

    await meters.recordView();
    responseStatus = 200;
    await expect(reporter.reportNow()).resolves.toBe(true);
    expect(requests[1]?.body).toEqual(requests[0]?.body);
    expect(requests[1]?.authorization).toBe('Bearer reporting-secret');

    await reporter.reportNow();
    expect(requests[2]?.body).toEqual(expect.objectContaining({
      sequence: 2,
      metrics: expect.objectContaining({ 'pdf.views': 2 }),
    }));
  } finally {
    reporter.stop();
    await db.destroy();
  }
});

test('restricted licensing keeps reads and readiness available while blocking mutations', async () => {
  const gate: LicenseGate = {
    getStatus: () => ({
      access: 'restricted',
      code: 'LICENSE_EXPIRED',
      expiresAt: '2029-01-01T00:00:00.000Z',
      lastValidatedAt: '2028-12-01T00:00:00.000Z',
      licenseKind: null,
      message: 'renewal required',
      meters: [],
      mode: 'air-gapped',
      telemetryProfile: 'none',
    }),
  };
  const bundle = await buildApp({
    licenseGate: gate,
    verifier: { mode: 'hs256', secret: 'test-secret' },
    workerEntry: null,
  });
  try {
    const ready = await bundle.app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().license.access).toBe('restricted');

    const read = await bundle.app.inject({ method: 'GET', url: '/unknown-read' });
    // The normal auth boundary still applies, but the licensing gate does
    // not replace a read with its own 403.
    expect(read.statusCode).toBe(401);
    expect(read.headers['x-cloudpdf-license-status']).toBe('LICENSE_EXPIRED');

    const write = await bundle.app.inject({ method: 'POST', url: '/unknown-write' });
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe('LICENSE_EXPIRED');
  } finally {
    await bundle.shutdown();
  }
});
