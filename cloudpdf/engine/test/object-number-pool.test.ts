import { describe, expect, test } from 'vitest';
import type { ObjectNumberRange, ObjectNumbersLost } from '@embedpdf/engine-core/runtime';
import { CloudObjectNumberPool } from '../src/document/CloudObjectNumberPool';

/**
 * The cloud engine's object number pool: what the server handed this
 * editing session, reconciled against what the server says it holds.
 */

const range = (first: number, count: number): ObjectNumberRange => ({ first, count });

function pool(reserve?: (count: number) => ObjectNumberRange[]) {
  let clock = 1_000_000;
  const requests: number[] = [];
  const lost: ObjectNumbersLost[] = [];
  const numbers = new CloudObjectNumberPool({
    now: () => clock,
    reserve: async (count) => {
      requests.push(count);
      return { objectNumbers: reserve ? reserve(count) : [], expiresIn: 900 };
    },
  });
  numbers.onLost((event) => lost.push(event));
  return {
    numbers,
    requests,
    lost,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('handing out', () => {
  test('what the server handed, lowest first, each once', () => {
    const { numbers } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(20, 2), range(10, 2)] });
    expect(numbers.held).toBe(4);
    expect([numbers.take(), numbers.take(), numbers.take(), numbers.take()]).toEqual([
      10, 11, 20, 21,
    ]);
    expect(numbers.take()).toBeNull();
    // The same numbers again (a repeated top-up) aren't held twice.
    numbers.receive([range(10, 2)]);
    expect(numbers.held).toBe(0);
  });

  test('writes ask for a top-up below 8; access asks for the first block', () => {
    const { numbers } = pool();
    expect(numbers.wantedAtAccess()).toBe(8);
    expect(numbers.topUp()).toBe(32);
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 8)] });
    expect(numbers.wantedAtAccess()).toBe(0);
    expect(numbers.topUp()).toBe(0);
    numbers.take();
    expect(numbers.topUp()).toBe(25);
  });

  test('reserve asks the bulk route only for what is short, one request at a time', async () => {
    let next = 100;
    const { numbers, requests } = pool((count) => {
      const handed = range(next, count);
      next += count;
      return [handed];
    });
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 8)] });
    await numbers.reserve(5);
    expect(requests).toEqual([]);
    await Promise.all([numbers.reserve(20), numbers.reserve(30)]);
    expect(requests).toEqual([12, 10]);
    expect(numbers.held).toBe(30);
    await numbers.reserve(2_500);
    expect(requests.slice(2)).toEqual([1_000, 1_000, 470]);
  });
});

describe('what the server says the session holds', () => {
  test('a session the server made anew holds nothing of what the pool had', () => {
    const { numbers, lost } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 4)] });
    const mine = numbers.take()!;
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(50, 2)] });
    expect(lost).toEqual([{ numbers: [mine, 11, 12, 13], reason: 'reclaimed' }]);
    expect(numbers.take()).toBe(50);
  });

  test("the stream's list is the truth: anything off it is lost, unless a write in flight names it", () => {
    const { numbers, lost } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 6)] });
    const [inFlight, taken] = [numbers.take()!, numbers.take()!];
    numbers.beginWrite([inFlight]);
    // The server lost 10 to 13 (a reclaim) and handed out 40 and 41.
    numbers.sync({ held: [range(14, 2), range(40, 2)], expiresIn: 600 });
    expect(lost).toEqual([{ numbers: [taken, 12, 13], reason: 'reclaimed' }]);
    expect([numbers.take(), numbers.take(), numbers.take(), numbers.take()]).toEqual([
      14, 15, 40, 41,
    ]);
    // The write commits: its number is spent, not lost.
    numbers.endWrite([inFlight], 'committed');
    numbers.sync({ held: [], expiresIn: 600 });
    expect(lost.at(-1)!.numbers).not.toContain(inFlight);
  });

  test('a number a failed write named stays the caller’s; a refused one is gone', () => {
    const { numbers, lost } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 3)] });
    const [failed, refused] = [numbers.take()!, numbers.take()!];
    numbers.beginWrite([failed, refused]);
    numbers.endWrite([failed], 'failed');
    numbers.endWrite([refused], 'refused');
    // The server still holds the failed write's number, which isn't handed
    // out again, and not the refused one, which isn't reported lost either.
    numbers.sync({ held: [range(10, 1), range(12, 1)], expiresIn: 900 });
    expect(numbers.take()).toBe(12);
    expect(numbers.take()).toBeNull();
    expect(lost).toEqual([]);
  });

  test('a new version loses everything, once per version', () => {
    const { numbers, lost } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 3)] });
    const taken = numbers.take()!;
    numbers.versioned('sha-2');
    expect(lost).toEqual([{ numbers: [taken, 11, 12], reason: 'versioned' }]);
    numbers.sync({ held: [range(80, 8)], expiresIn: 900 });
    // The engine's own completion tells the same version again.
    numbers.versioned('sha-2');
    expect(numbers.held).toBe(8);
  });
});

describe('expiry', () => {
  test('with the stream down past the expiry, nothing is handed out until the server speaks', () => {
    const { numbers, lost, advance } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 4)] });
    advance(900_000);
    expect(numbers.held).toBe(0);
    expect(numbers.take()).toBeNull();
    // A `session` event says which survived.
    numbers.sync({ held: [range(12, 2)], expiresIn: 900 });
    expect(lost).toEqual([{ numbers: [10, 11], reason: 'reclaimed' }]);
    expect(numbers.held).toBe(2);
  });

  test('new numbers after an expiry drop the old ones, which nothing vouches for', () => {
    const { numbers, lost, advance } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 2)] });
    advance(900_000);
    numbers.receive([range(30, 2)], 900);
    expect(lost).toEqual([{ numbers: [10, 11], reason: 'reclaimed' }]);
    expect([numbers.take(), numbers.take()]).toEqual([30, 31]);
  });

  test('a connected stream keeps the session alive; a committed write keeps it half a lifetime', () => {
    const { numbers, advance } = pool();
    numbers.opened({ session: 'new', expiresIn: 900, objectNumbers: [range(10, 4)] });
    numbers.connected(true);
    advance(2_000_000);
    expect(numbers.held).toBe(4);
    numbers.connected(false);
    expect(numbers.held).toBe(0);

    numbers.sync({ held: [range(10, 4)], expiresIn: 100 });
    const named = numbers.take()!;
    numbers.beginWrite([named]);
    numbers.endWrite([named], 'committed');
    advance(400_000);
    expect(numbers.held).toBe(3);
    advance(51_000);
    expect(numbers.held).toBe(0);
  });
});
