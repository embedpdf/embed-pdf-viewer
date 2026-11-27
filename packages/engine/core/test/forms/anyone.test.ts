import { describe, expect, test } from 'vitest';

import { checkedForAnyone, withForAnyone } from '../../src/forms/anyone';
import { EngineError } from '../../src/errors/EngineError';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';

const refusal = (attempt: () => unknown): unknown => {
  try {
    attempt();
  } catch (error) {
    return error;
  }
  return null;
};

describe('checkedForAnyone', () => {
  const plain = { kind: 'text', groupId: null } as const;

  test('what the write names, else what the field was', () => {
    expect(checkedForAnyone(undefined, plain)).toBe(false);
    expect(checkedForAnyone(true, plain)).toBe(true);
    expect(checkedForAnyone(false, plain, true)).toBe(false);
    expect(checkedForAnyone(undefined, plain, true)).toBe(true);
    expect(checkedForAnyone(true, { kind: 'pushbutton', groupId: null })).toBe(true);
  });

  test('refuses a field in a group, a signature field and a value that is not a boolean', () => {
    for (const [named, field, was] of [
      [true, { kind: 'text', groupId: 'dana' }, false],
      // A group named for a field that is for anyone, without `false`.
      [undefined, { kind: 'text', groupId: 'dana' }, true],
      [true, { kind: 'signature', groupId: null }, false],
      ['yes', plain, false],
      [null, plain, false],
    ] as const) {
      const error = refusal(() => checkedForAnyone(named, field, was));
      expect(EngineError.is(error) && error.code).toBe(EngineErrorCode.InvalidArg);
      expect((error as EngineError).details).toMatchObject({ field: 'forAnyone' });
    }
    // `false` is fine anywhere.
    expect(checkedForAnyone(false, { kind: 'signature', groupId: 'dana' })).toBe(false);
  });
});

describe('withForAnyone', () => {
  test('gives an older field forAnyone: false and leaves a whole one as it is', () => {
    expect(withForAnyone({ name: 'a' })).toEqual({ name: 'a', forAnyone: false });
    const whole = { name: 'a', forAnyone: true };
    expect(withForAnyone(whole)).toBe(whole);
  });
});
