import { describe, expect, test } from 'vitest';
import { RequestRateLimiter } from '../src/app/request-rate-limiter';

describe('RequestRateLimiter', () => {
  function makeClock(startAt = 1_000_000) {
    let t = startAt;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  test('allows the budget, then blocks until the window expires', () => {
    const clock = makeClock();
    const limiter = new RequestRateLimiter({ maxAttempts: 3, windowMs: 60_000 }, clock.now);

    expect(limiter.consume('ip-1')).toBe(0);
    expect(limiter.consume('ip-1')).toBe(0);
    expect(limiter.consume('ip-1')).toBe(0);
    expect(limiter.consume('ip-1')).toBe(60_000);

    clock.advance(45_000);
    expect(limiter.consume('ip-1')).toBe(15_000);
    clock.advance(15_000);
    expect(limiter.consume('ip-1')).toBe(0);
  });

  test('blocked attempts do not extend the block', () => {
    const clock = makeClock();
    const limiter = new RequestRateLimiter({ maxAttempts: 1, windowMs: 60_000 }, clock.now);

    expect(limiter.consume('ip-1')).toBe(0);
    for (let i = 0; i < 100; i++) {
      expect(limiter.consume('ip-1')).toBeGreaterThan(0);
    }
    // The window is fixed from its first attempt: hammering while
    // blocked does not push recovery out.
    clock.advance(60_000);
    expect(limiter.consume('ip-1')).toBe(0);
  });

  test('keys are independent', () => {
    const clock = makeClock();
    const limiter = new RequestRateLimiter({ maxAttempts: 1, windowMs: 60_000 }, clock.now);
    expect(limiter.consume('ip-1')).toBe(0);
    expect(limiter.consume('ip-1')).toBeGreaterThan(0);
    expect(limiter.consume('ip-2')).toBe(0);
  });

  test('check-and-count is one step: exactly maxAttempts proceed in a same-tick burst', () => {
    const limiter = new RequestRateLimiter({ maxAttempts: 5, windowMs: 60_000 }, () => 42);
    const results = Array.from({ length: 20 }, () => limiter.consume('ip-1'));
    expect(results.filter((r) => r === 0)).toHaveLength(5);
    expect(results.slice(5).every((r) => r > 0)).toBe(true);
  });

  test('bounds tracked keys under key-spray', () => {
    const clock = makeClock();
    const limiter = new RequestRateLimiter(
      { maxAttempts: 1, windowMs: 60_000, maxEntries: 100 },
      clock.now,
    );
    for (let i = 0; i < 1_000; i++) limiter.consume(`ip-${i}`);
    // The earliest keys were dropped to keep memory bounded; the most
    // recent key is still tracked and blocked.
    expect(limiter.consume('ip-999')).toBeGreaterThan(0);
    expect(limiter.consume('ip-0')).toBe(0);
  });
});
