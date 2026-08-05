import { describe, expect, test } from 'vitest';
import { AuthFailureLimiter } from '../src/app/auth-failure-limiter';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import { signDevToken } from '../src/auth/JwtVerifier';

describe('AuthFailureLimiter', () => {
  function makeClock(startAt = 1_000_000) {
    let t = startAt;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  test('blocks only once the failure budget is spent, until the window expires', () => {
    const clock = makeClock();
    const limiter = new AuthFailureLimiter({ maxFailures: 3, windowMs: 60_000 }, clock.now);

    expect(limiter.retryAfterMs('ip-1')).toBe(0);
    limiter.recordFailure('ip-1');
    limiter.recordFailure('ip-1');
    expect(limiter.retryAfterMs('ip-1')).toBe(0);
    limiter.recordFailure('ip-1');
    expect(limiter.retryAfterMs('ip-1')).toBe(60_000);

    clock.advance(45_000);
    expect(limiter.retryAfterMs('ip-1')).toBe(15_000);
    clock.advance(15_000);
    expect(limiter.retryAfterMs('ip-1')).toBe(0);
  });

  test('keys are independent', () => {
    const clock = makeClock();
    const limiter = new AuthFailureLimiter({ maxFailures: 1, windowMs: 60_000 }, clock.now);
    limiter.recordFailure('ip-1');
    expect(limiter.retryAfterMs('ip-1')).toBeGreaterThan(0);
    expect(limiter.retryAfterMs('ip-2')).toBe(0);
  });

  test('a failure after the window starts a fresh window, not a longer block', () => {
    const clock = makeClock();
    const limiter = new AuthFailureLimiter({ maxFailures: 2, windowMs: 60_000 }, clock.now);
    limiter.recordFailure('ip-1');
    limiter.recordFailure('ip-1');
    clock.advance(60_000);
    limiter.recordFailure('ip-1');
    expect(limiter.retryAfterMs('ip-1')).toBe(0);
  });

  test('bounds tracked keys under address spray', () => {
    const clock = makeClock();
    const limiter = new AuthFailureLimiter(
      { maxFailures: 1, windowMs: 60_000, maxEntries: 100 },
      clock.now,
    );
    for (let i = 0; i < 1_000; i++) limiter.recordFailure(`ip-${i}`);
    // The earliest keys were dropped to keep memory bounded; the most
    // recent key is still tracked and blocked.
    expect(limiter.retryAfterMs('ip-999')).toBeGreaterThan(0);
    expect(limiter.retryAfterMs('ip-0')).toBe(0);
  });
});

describe('auth failure throttling through the app', () => {
  const SECRET = 'auth-limiter-integration-secret';

  async function makeApp(authFailureLimit?: { maxFailures: number; windowMs?: number } | false) {
    return buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: SECRET },
      workerEntry: null,
      ...(authFailureLimit !== undefined ? { authFailureLimit } : {}),
    });
  }

  test('invalid tokens get a generic 401 body, then 429 with Retry-After', async () => {
    const bundle = await makeApp({ maxFailures: 2, windowMs: 60_000 });
    try {
      const bad = { authorization: 'Bearer not-a-jwt' };
      const first = await bundle.app.inject({
        method: 'GET',
        url: '/v1/admin/license/status',
        headers: bad,
      });
      expect(first.statusCode).toBe(401);
      // Verifier internals (why the token failed) stay in the logs.
      expect(first.json()).toEqual({ error: 'invalid token' });

      const second = await bundle.app.inject({
        method: 'GET',
        url: '/v1/admin/license/status',
        headers: bad,
      });
      expect(second.statusCode).toBe(401);

      const third = await bundle.app.inject({
        method: 'GET',
        url: '/v1/admin/license/status',
        headers: bad,
      });
      expect(third.statusCode).toBe(429);
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
      expect(third.json()).toEqual({ error: 'too many failed authentication attempts' });

      // The block covers the source, valid token or not — that is the
      // point of early rejection (no verify CPU for a hostile source)...
      const valid = signDevToken(SECRET, { sub: 'u', tenant_id: 't', scope: ['docs.read'] });
      const blockedValid = await bundle.app.inject({
        method: 'GET',
        url: '/v1/admin/license/status',
        headers: { authorization: `Bearer ${valid}` },
      });
      expect(blockedValid.statusCode).toBe(429);

      // ...but other sources are untouched.
      const otherIp = await bundle.app.inject({
        method: 'GET',
        url: '/v1/admin/license/status',
        headers: { authorization: `Bearer ${valid}` },
        remoteAddress: '203.0.113.9',
      });
      expect(otherIp.statusCode).toBe(200);
    } finally {
      await bundle.shutdown();
    }
  });

  test('missing bearer tokens also consume the failure budget', async () => {
    const bundle = await makeApp({ maxFailures: 1, windowMs: 60_000 });
    try {
      const first = await bundle.app.inject({ method: 'GET', url: '/v1/admin/license/status' });
      expect(first.statusCode).toBe(401);
      const second = await bundle.app.inject({ method: 'GET', url: '/v1/admin/license/status' });
      expect(second.statusCode).toBe(429);
    } finally {
      await bundle.shutdown();
    }
  });

  test('health checks bypass auth even with a querystring, and are never counted', async () => {
    const bundle = await makeApp({ maxFailures: 1, windowMs: 60_000 });
    try {
      for (let i = 0; i < 5; i++) {
        const res = await bundle.app.inject({ method: 'GET', url: '/healthz?probe=1' });
        expect(res.statusCode).toBe(200);
      }
      // Budget untouched: an authed request still gets 401, not 429.
      const after = await bundle.app.inject({ method: 'GET', url: '/v1/admin/license/status' });
      expect(after.statusCode).toBe(401);
    } finally {
      await bundle.shutdown();
    }
  });

  test('successful auth is never throttled at any request rate', async () => {
    const bundle = await makeApp({ maxFailures: 2, windowMs: 60_000 });
    try {
      const valid = signDevToken(SECRET, { sub: 'u', tenant_id: 't', scope: ['docs.read'] });
      for (let i = 0; i < 20; i++) {
        const res = await bundle.app.inject({
          method: 'GET',
          url: '/v1/admin/license/status',
          headers: { authorization: `Bearer ${valid}` },
        });
        expect(res.statusCode).toBe(200);
      }
    } finally {
      await bundle.shutdown();
    }
  });

  test('authFailureLimit: false disables throttling', async () => {
    const bundle = await makeApp(false);
    try {
      for (let i = 0; i < 40; i++) {
        const res = await bundle.app.inject({
          method: 'GET',
          url: '/v1/admin/license/status',
          headers: { authorization: 'Bearer nope' },
        });
        expect(res.statusCode).toBe(401);
      }
    } finally {
      await bundle.shutdown();
    }
  });
});
