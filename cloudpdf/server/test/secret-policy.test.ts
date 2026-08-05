import { describe, expect, test } from 'vitest';
import {
  assertProductionSecret,
  DEV_FALLBACK_SECRETS,
  requiresProductionSecrets,
  resolveSecret,
} from '../src/app/secret-policy';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import type { LicenseGate, LicenseGateStatus } from '../src/licensing/LicenseRuntime';

const STRONG = 'a-strong-secret-of-at-least-32-bytes!';

function gateWith(overrides: Partial<LicenseGateStatus>): LicenseGate {
  const status: LicenseGateStatus = {
    access: 'full',
    code: 'VALID',
    expiresAt: null,
    lastValidatedAt: new Date().toISOString(),
    licenseKind: 'subscription',
    message: 'test',
    meters: [],
    mode: 'connected',
    telemetryProfile: 'none',
    ...overrides,
  };
  return { getStatus: () => ({ ...status }) };
}

describe('requiresProductionSecrets', () => {
  test('subscription / evaluation / unknown-kind licenses enforce', () => {
    expect(requiresProductionSecrets(gateWith({ licenseKind: 'subscription' }).getStatus())).toBe(
      true,
    );
    expect(requiresProductionSecrets(gateWith({ licenseKind: 'evaluation' }).getStatus())).toBe(
      true,
    );
    // Fail closed: an older certificate without a purpose is production.
    expect(requiresProductionSecrets(gateWith({ licenseKind: null }).getStatus())).toBe(true);
  });

  test('development keys and the test gate keep dev fallbacks', () => {
    expect(requiresProductionSecrets(gateWith({ licenseKind: 'development' }).getStatus())).toBe(
      false,
    );
    expect(requiresProductionSecrets(createValidTestLicenseGate().getStatus())).toBe(false);
  });

  test('a gate that refuses all traffic is exempt (license error is the message)', () => {
    expect(requiresProductionSecrets(gateWith({ access: 'none' }).getStatus())).toBe(false);
  });

  test('restricted (e.g. expired) production licenses still enforce', () => {
    expect(
      requiresProductionSecrets(
        gateWith({ access: 'restricted', code: 'LICENSE_EXPIRED', licenseKind: null }).getStatus(),
      ),
    ).toBe(true);
  });
});

describe('assertProductionSecret', () => {
  const req = { name: 'test secret', envVar: 'TEST_SECRET', option: 'testSecret' };

  test('accepts >= 32 bytes', () => {
    expect(() => assertProductionSecret(STRONG, req)).not.toThrow();
    expect(() => assertProductionSecret(Buffer.alloc(32, 7), req)).not.toThrow();
  });

  test('rejects missing, short, and every public dev fallback', () => {
    expect(() => assertProductionSecret(undefined, req)).toThrow(/not configured/);
    expect(() => assertProductionSecret('short', req)).toThrow(/too short \(5 bytes/);
    expect(() => assertProductionSecret(Buffer.alloc(31), req)).toThrow(/too short/);
    for (const fallback of DEV_FALLBACK_SECRETS) {
      expect(() => assertProductionSecret(fallback, req)).toThrow(/publicly-known dev fallback/);
    }
  });

  test('error names the env var and the option', () => {
    expect(() => assertProductionSecret(undefined, req)).toThrow(/TEST_SECRET/);
    expect(() => assertProductionSecret(undefined, req)).toThrow(/testSecret/);
  });
});

describe('resolveSecret', () => {
  const requirement = { name: 'test secret', envVar: 'TEST_SECRET_ENV', option: 'testSecret' };

  test('precedence: explicit > env > dev fallback', () => {
    const env = { TEST_SECRET_ENV: 'from-env' } as NodeJS.ProcessEnv;
    expect(
      resolveSecret({ explicit: 'explicit', env, requirement, devFallback: 'dev', enforce: false }),
    ).toBe('explicit');
    expect(
      resolveSecret({ explicit: undefined, env, requirement, devFallback: 'dev', enforce: false }),
    ).toBe('from-env');
    expect(
      resolveSecret({
        explicit: undefined,
        env: {},
        requirement,
        devFallback: 'dev',
        enforce: false,
      }),
    ).toBe('dev');
  });

  test('enforce: nothing configured reports "not configured", not "dev fallback"', () => {
    expect(() =>
      resolveSecret({
        explicit: undefined,
        env: {},
        requirement,
        devFallback: 'dev',
        enforce: true,
      }),
    ).toThrow(/not configured/);
  });

  test('enforce: weak env value is rejected, strong one passes', () => {
    expect(() =>
      resolveSecret({
        explicit: undefined,
        env: { TEST_SECRET_ENV: 'weak' } as NodeJS.ProcessEnv,
        requirement,
        devFallback: 'dev',
        enforce: true,
      }),
    ).toThrow(/too short/);
    expect(
      resolveSecret({
        explicit: undefined,
        env: { TEST_SECRET_ENV: STRONG } as NodeJS.ProcessEnv,
        requirement,
        devFallback: 'dev',
        enforce: true,
      }),
    ).toBe(STRONG);
  });
});

describe('buildApp secret enforcement', () => {
  test('production-kind license refuses the dev / short hs256 secret', async () => {
    await expect(
      buildAppForTesting({
        licenseGate: gateWith({ licenseKind: 'subscription' }),
        verifier: { mode: 'hs256', secret: 'cloudpdf-dev-secret-change-me' },
        workerEntry: null,
      }),
    ).rejects.toThrow(/JWT HS256 secret.*publicly-known dev fallback/);
    await expect(
      buildAppForTesting({
        licenseGate: gateWith({ licenseKind: 'subscription' }),
        verifier: { mode: 'hs256', secret: 'short' },
        workerEntry: null,
      }),
    ).rejects.toThrow(/JWT HS256 secret.*too short/);
  });

  test('production-kind license boots with a strong hs256 secret', async () => {
    const bundle = await buildAppForTesting({
      licenseGate: gateWith({ licenseKind: 'subscription' }),
      verifier: { mode: 'hs256', secret: STRONG },
      workerEntry: null,
    });
    try {
      const res = await bundle.app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
    } finally {
      await bundle.shutdown();
    }
  });

  test('development license keeps the zero-config dev boot working', async () => {
    const bundle = await buildAppForTesting({
      licenseGate: gateWith({ licenseKind: 'development' }),
      verifier: { mode: 'hs256', secret: 'cloudpdf-dev-secret-change-me' },
      workerEntry: null,
    });
    try {
      const res = await bundle.app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
    } finally {
      await bundle.shutdown();
    }
  });
});
