import { createHash, generateKeyPairSync, sign } from 'node:crypto';
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
import { deriveConnectedReportingCredential } from '../src/licensing/reporting-credential';
import { buildApp, buildAppForTesting } from '../src/app/buildApp';

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
  const envelope = Buffer.from(JSON.stringify({ alg: 'base64+ed25519', enc, sig })).toString(
    'base64',
  );
  return `-----BEGIN MACHINE FILE-----\n${envelope}\n-----END MACHINE FILE-----`;
}

function keygenValidationBody(input: {
  code: string;
  expiry?: string;
  fingerprint: string;
  key: string;
  metadata?: Record<string, unknown>;
  nonce: number;
  status?: string;
  valid: boolean;
}): Record<string, unknown> {
  return {
    data: {
      attributes: {
        expiry: input.expiry ?? '2029-02-01T00:00:00.000Z',
        key: input.key,
        metadata: { offlineGraceHours: 72, ...input.metadata },
        status: input.status ?? 'ACTIVE',
      },
      id: 'license-id',
      relationships: {
        account: { data: { id: accountId, type: 'accounts' } },
        product: { data: { id: productId, type: 'products' } },
      },
      type: 'licenses',
    },
    meta: {
      code: input.code,
      nonce: input.nonce,
      scope: { fingerprint: input.fingerprint, product: productId },
      valid: input.valid,
    },
  };
}

function signedKeygenResponse(input: {
  body: Record<string, unknown>;
  date?: Date;
  identity: CloudPdfLicenseIdentity;
  method?: string;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
  status?: number;
  url: string | URL | Request;
}): Response {
  const rawBody = JSON.stringify(input.body);
  const url = new URL(String(input.url));
  const date = (input.date ?? new Date()).toUTCString();
  const digest = `sha-256=${createHash('sha256').update(rawBody).digest('base64')}`;
  const signingData = [
    `(request-target): ${(input.method ?? 'POST').toLowerCase()} ${url.pathname}${url.search}`,
    `host: ${url.host}`,
    `date: ${date}`,
    `digest: ${digest}`,
  ].join('\n');
  const signature = sign(null, Buffer.from(signingData), input.privateKey).toString('base64');
  return new Response(rawBody, {
    headers: {
      date,
      digest,
      'keygen-signature': [
        `keyid="${input.identity.accountId}"`,
        'algorithm="ed25519"',
        `signature="${signature}"`,
        'headers="(request-target) host date digest"',
      ].join(', '),
    },
    status: input.status ?? 200,
  });
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

    expect(() =>
      verifyMachineCertificate({
        certificate,
        expectedFingerprint: 'deployment-b',
        identity,
        now: new Date('2029-01-05T00:00:00.000Z'),
      }),
    ).toThrow(/another deployment/);
    expect(() =>
      verifyMachineCertificate({
        certificate: certificate.replace('MACHINE FILE', 'MACHINE FILF'),
        expectedFingerprint: 'deployment-a',
        identity,
        now: new Date('2029-01-05T00:00:00.000Z'),
      }),
    ).toThrow(/invalid envelope/);
    expect(() =>
      verifyMachineCertificate({
        certificate,
        expectedFingerprint: 'deployment-a',
        identity,
        now: new Date('2029-01-11T00:00:00.000Z'),
      }),
    ).toThrow(/expired/);
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
  const { identity, privateKey } = createSigningIdentity();
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  let validations = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? 'GET',
        url: String(url),
      });
      if (String(url).endsWith('/licenses/actions/validate-key')) {
        validations += 1;
        const requestBody = JSON.parse(String(init?.body)) as {
          meta: { key: string; nonce: number; scope: { fingerprint: string } };
        };
        return signedKeygenResponse({
          body: keygenValidationBody({
            code: validations === 1 ? 'NO_MACHINES' : 'VALID',
            fingerprint: requestBody.meta.scope.fingerprint,
            key: requestBody.meta.key,
            nonce: requestBody.meta.nonce,
            valid: validations > 1,
          }),
          identity,
          privateKey,
          url,
        });
      }
      return signedKeygenResponse({
        body: {
          data: {
            attributes: { fingerprint: 'deployment-fingerprint' },
            id: 'machine-id',
            type: 'machines',
          },
        },
        identity,
        privateKey,
        status: 201,
        url,
      });
    }),
  );

  const validation = await validateConnectedLicense({
    fingerprint: 'deployment-fingerprint',
    identity,
    key: 'license-key',
  });

  expect(validation.code).toBe('VALID');
  expect(requests.map((request) => request.method)).toEqual(['POST', 'POST', 'POST']);
  expect(requests[1]?.body).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        attributes: expect.objectContaining({ fingerprint: 'deployment-fingerprint' }),
      }),
    }),
  );
});

test.each(['EXPIRING', 'INACTIVE'])(
  'connected validation accepts a signed valid license with informational status %s',
  async (status) => {
    const { identity, privateKey } = createSigningIdentity();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as {
          meta: { key: string; nonce: number; scope: { fingerprint: string } };
        };
        return signedKeygenResponse({
          body: keygenValidationBody({
            code: 'VALID',
            fingerprint: requestBody.meta.scope.fingerprint,
            key: requestBody.meta.key,
            nonce: requestBody.meta.nonce,
            status,
            valid: true,
          }),
          identity,
          privateKey,
          url,
        });
      }),
    );

    await expect(
      validateConnectedLicense({
        fingerprint: 'deployment-fingerprint',
        identity,
        key: 'license-key',
      }),
    ).resolves.toMatchObject({ code: 'VALID', valid: true });
  },
);

test('connected validation rejects a signed valid decision whose expiry has passed', async () => {
  const { identity, privateKey } = createSigningIdentity();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        meta: { key: string; nonce: number; scope: { fingerprint: string } };
      };
      return signedKeygenResponse({
        body: keygenValidationBody({
          code: 'VALID',
          expiry: '2020-01-01T00:00:00.000Z',
          fingerprint: requestBody.meta.scope.fingerprint,
          key: requestBody.meta.key,
          nonce: requestBody.meta.nonce,
          valid: true,
        }),
        identity,
        privateKey,
        url,
      });
    }),
  );

  await expect(
    validateConnectedLicense({
      fingerprint: 'deployment-fingerprint',
      identity,
      key: 'license-key',
    }),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    message: 'Keygen returned valid=true for an expired license',
    retryable: false,
  });
});

test('connected validation rejects an unsigned success response', async () => {
  const { identity } = createSigningIdentity();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        meta: { key: string; nonce: number; scope: { fingerprint: string } };
      };
      return Response.json(
        keygenValidationBody({
          code: 'VALID',
          fingerprint: requestBody.meta.scope.fingerprint,
          key: requestBody.meta.key,
          nonce: requestBody.meta.nonce,
          valid: true,
        }),
      );
    }),
  );

  await expect(
    validateConnectedLicense({
      fingerprint: 'deployment-fingerprint',
      identity,
      key: 'license-key',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
});

test('connected validation preserves a signed Keygen lookup denial', async () => {
  const { identity, privateKey } = createSigningIdentity();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        meta: { nonce: number; scope: { fingerprint: string } };
      };
      return signedKeygenResponse({
        body: {
          data: null,
          meta: {
            code: 'NOT_FOUND',
            detail: 'license not found',
            nonce: requestBody.meta.nonce,
            scope: { fingerprint: requestBody.meta.scope.fingerprint, product: productId },
            valid: false,
          },
        },
        identity,
        privateKey,
        url,
      });
    }),
  );

  await expect(
    validateConnectedLicense({
      fingerprint: 'deployment-fingerprint',
      identity,
      key: 'unknown-license-key',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', retryable: false });
});

test('connected validation rejects signed replay and scope mismatches', async () => {
  const { identity, privateKey } = createSigningIdentity();
  const cases = [
    {
      name: 'nonce',
      mutate: (body: ReturnType<typeof keygenValidationBody>) => {
        const meta = body.meta as Record<string, unknown>;
        meta.nonce = Number(meta.nonce) + 1;
      },
    },
    {
      name: 'scope',
      mutate: (body: ReturnType<typeof keygenValidationBody>) => {
        const meta = body.meta as Record<string, unknown>;
        meta.scope = { fingerprint: 'another-deployment', product: productId };
      },
    },
  ];

  for (const scenario of cases) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body)) as {
          meta: { key: string; nonce: number; scope: { fingerprint: string } };
        };
        const body = keygenValidationBody({
          code: 'VALID',
          fingerprint: requestBody.meta.scope.fingerprint,
          key: requestBody.meta.key,
          nonce: requestBody.meta.nonce,
          valid: true,
        });
        scenario.mutate(body);
        return signedKeygenResponse({ body, identity, privateKey, url });
      }),
    );
    await expect(
      validateConnectedLicense({
        fingerprint: 'deployment-fingerprint',
        identity,
        key: 'license-key',
      }),
      scenario.name,
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  }
});

test('connected validation rejects stale signed responses and modified response bytes', async () => {
  const { identity, privateKey } = createSigningIdentity();
  let mode: 'stale' | 'tampered' = 'stale';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        meta: { key: string; nonce: number; scope: { fingerprint: string } };
      };
      const response = signedKeygenResponse({
        body: keygenValidationBody({
          code: 'VALID',
          fingerprint: requestBody.meta.scope.fingerprint,
          key: requestBody.meta.key,
          nonce: requestBody.meta.nonce,
          valid: true,
        }),
        ...(mode === 'stale' ? { date: new Date(Date.now() - 10 * 60 * 1_000) } : {}),
        identity,
        privateKey,
        url,
      });
      if (mode === 'stale') return response;
      return new Response(`${await response.text()} `, { headers: response.headers });
    }),
  );

  await expect(
    validateConnectedLicense({
      fingerprint: 'deployment-fingerprint',
      identity,
      key: 'license-key',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  mode = 'tampered';
  await expect(
    validateConnectedLicense({
      fingerprint: 'deployment-fingerprint',
      identity,
      key: 'license-key',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('connected cache requires an encrypted, signed proof bound to the key and deployment', async () => {
  const { identity, privateKey } = createSigningIdentity();
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const key = 'license-key';
  const env = { CLOUDPDF_LICENSE_KEY: key, CLOUDPDF_LICENSE_MODE: 'connected' };
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      meta: { key: string; nonce: number; scope: { fingerprint: string } };
    };
    return signedKeygenResponse({
      body: keygenValidationBody({
        code: 'VALID',
        fingerprint: requestBody.meta.scope.fingerprint,
        key: requestBody.meta.key,
        metadata: { cloudpdfLicenseId: 'cloudpdf-license-record-id' },
        nonce: requestBody.meta.nonce,
        valid: true,
      }),
      identity,
      privateKey,
      url,
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  // The reporting credential needs no configuration beyond the license key:
  // it is derived from the key and the signed cloudpdfLicenseId metadata.
  const expectedReportingCredential = deriveConnectedReportingCredential({
    cloudpdfLicenseId: 'cloudpdf-license-record-id',
    licenseKey: key,
  });

  const first = await LicenseRuntime.create({ db, env, identity, startTimer: false });
  expect(first.getStatus()).toMatchObject({ access: 'full', code: 'VALID' });
  expect(first.getConnectedReportingLicenseId()).toBe('cloudpdf-license-record-id');
  expect(first.getConnectedReportingCredential()).toBe(expectedReportingCredential);
  await first.close();

  const state = await new LicenseStateRepository(db).load();
  expect(state.validation_data_json).not.toContain(key);
  fetchMock.mockClear();
  const cached = await LicenseRuntime.create({ db, env, identity, startTimer: false });
  expect(cached.getStatus()).toMatchObject({ access: 'full', code: 'VALID_CACHED' });
  expect(cached.getConnectedReportingLicenseId()).toBe('cloudpdf-license-record-id');
  expect(cached.getConnectedReportingCredential()).toBe(expectedReportingCredential);
  expect(fetchMock).not.toHaveBeenCalled();
  await cached.close();

  await db
    .updateTable('license_runtime_state')
    .set({
      last_validated_at: Date.now(),
      license_key_fingerprint: createHash('sha256').update(key).digest('hex'),
      validation_data_json: JSON.stringify({
        code: 'VALID',
        expiresAt: null,
        metadata: { checkInIntervalHours: 24, offlineGraceHours: 72 },
        valid: true,
      }),
    })
    .where('singleton_id', '=', 1)
    .executeTakeFirstOrThrow();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ errors: [] }, { status: 401 })),
  );
  const forged = await LicenseRuntime.create({ db, env, identity, startTimer: false });
  expect(forged.getStatus()).toMatchObject({ access: 'none', code: 'HTTP_401' });
  await forged.close();
  await db.destroy();
});

test('a signed binding failure cannot turn an authentic cache entry into offline grace', async () => {
  const { identity, privateKey } = createSigningIdentity();
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const env = { CLOUDPDF_LICENSE_KEY: 'license-key', CLOUDPDF_LICENSE_MODE: 'connected' };
  let serveReplay = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        meta: { key: string; nonce: number; scope: { fingerprint: string } };
      };
      return signedKeygenResponse({
        body: keygenValidationBody({
          code: 'VALID',
          fingerprint: requestBody.meta.scope.fingerprint,
          key: requestBody.meta.key,
          // The authentic first response has an immediately-stale check-in
          // window but a long offline-grace window. The second response is a
          // signed replay mismatch and must not be treated like an outage.
          metadata: { checkInIntervalHours: Number.EPSILON, offlineGraceHours: 72 },
          nonce: serveReplay ? requestBody.meta.nonce + 1 : requestBody.meta.nonce,
          valid: true,
        }),
        identity,
        privateKey,
        url,
      });
    }),
  );

  const first = await LicenseRuntime.create({ db, env, identity, startTimer: false });
  expect(first.getStatus()).toMatchObject({ access: 'full', code: 'VALID' });
  await first.close();

  serveReplay = true;
  await new Promise((resolve) => setTimeout(resolve, 2));
  const replayed = await LicenseRuntime.create({ db, env, identity, startTimer: false });
  expect(replayed.getStatus()).toMatchObject({ access: 'restricted', code: 'INVALID_RESPONSE' });
  await replayed.close();
  await db.destroy();
});

test('production identity cannot be replaced through environment configuration', async () => {
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  await expect(
    LicenseRuntime.create({
      db,
      env: {
        CLOUDPDF_KEYGEN_API_URL: 'https://attacker.example',
        CLOUDPDF_LICENSE_MODE: 'air-gapped',
        NODE_ENV: 'test',
      },
      startTimer: false,
    }),
  ).rejects.toThrow(/identity is compiled into the application/);
  await db.destroy();
});

test('installs an air-gap certificate against the stable database deployment identity', async () => {
  const { identity, privateKey } = createSigningIdentity();
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const env = {
    CLOUDPDF_LICENSE_MODE: 'air-gapped',
  };
  const runtime = await LicenseRuntime.create({ db, env, identity, startTimer: false });
  try {
    const request = await runtime.createActivationRequest();
    const certificate = machineCertificate({
      expiry: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      fingerprint: request.fingerprint,
      issued: new Date(Date.now() - 60_000),
      metadata: {
        metersJson: JSON.stringify([
          {
            enforcement: 'hard-limit',
            limit: '100',
            metric: 'pdf.views',
            period: 'month',
            warningThresholds: [80, 90, 100],
          },
        ]),
        purpose: 'development',
        telemetryProfile: 'none',
      },
      privateKey,
    });
    await runtime.installCertificate(certificate);
    expect(runtime.getStatus()).toEqual(
      expect.objectContaining({
        access: 'full',
        code: 'VALID',
        licenseKind: 'development',
        mode: 'air-gapped',
        meters: [expect.objectContaining({ metric: 'pdf.views', limit: '100' })],
        telemetryProfile: 'none',
      }),
    );
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
      meters: [
        {
          enforcement: 'hard-limit',
          limit: '1',
          metric: 'pdf.views',
          period: 'month',
          warningThresholds: [80, 100],
        },
      ],
      mode: 'air-gapped',
      telemetryProfile: 'none',
    }),
  };
  const meters = new UsageMeters(db, gate);
  try {
    await expect(meters.recordView()).resolves.toBe(1);
    await expect(meters.recordView()).rejects.toBeInstanceOf(UsageLimitError);
    await expect(meters.recordUpload('doc-one')).resolves.toEqual({ value: 1, counted: true });
    await expect(meters.recordUpload('doc-one')).resolves.toEqual({ value: 1, counted: false });
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
  const cloudPdfLicenseId = 'cloudpdf-license-record-id';
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
  const requests: Array<{
    authorization: string | null;
    body: Record<string, unknown>;
    url: string;
  }> = [];
  let responseStatus = 400;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        authorization: new Headers(init?.headers).get('authorization'),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(url),
      });
      return new Response('', { status: responseStatus });
    }),
  );
  const reporter = await ConnectedUsageReporter.createForTesting({
    cloudPdfLicenseId,
    controlPlaneUrl: 'https://accounts.example.test',
    db,
    meters,
    reportingCredential: 'cpr_v1_test-reporting-credential',
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
    expect(requests[1]?.authorization).toBe('Bearer cpr_v1_test-reporting-credential');
    expect(requests[1]?.url).toBe(
      `https://accounts.example.test/v1/licenses/${cloudPdfLicenseId}/usage`,
    );

    await reporter.reportNow();
    expect(requests[2]?.body).toEqual(
      expect.objectContaining({
        sequence: 2,
        metrics: expect.objectContaining({ 'pdf.views': 2 }),
      }),
    );
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
  const bundle = await buildAppForTesting({
    licenseGate: gate,
    // Production-shaped gate (licenseKind null): the secret policy applies,
    // so this must be a >= 32-byte secret. Restriction semantics under test
    // are unaffected.
    verifier: { mode: 'hs256', secret: 'test-secret-that-is-32-bytes-long!!' },
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

test('public buildApp rejects a caller-supplied license decision', async () => {
  const forgedGate: LicenseGate = {
    getStatus: () => ({
      access: 'full',
      code: 'VALID',
      expiresAt: null,
      lastValidatedAt: new Date().toISOString(),
      licenseKind: 'subscription',
      message: 'forged',
      meters: [],
      mode: 'connected',
      telemetryProfile: 'none',
    }),
  };
  await expect(
    buildApp({
      licenseGate: forgedGate,
      verifier: { mode: 'hs256', secret: 'test-secret' },
      workerEntry: null,
    }),
  ).rejects.toThrow(/created by createLicenseRuntime/);
});
