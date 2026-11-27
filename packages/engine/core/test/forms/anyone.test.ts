import { describe, expect, test } from 'vitest';

import { assignmentAfter, checkedForAnyone, withForAnyone } from '../../src/forms/anyone';
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
      // A field for anyone, left in a group.
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

describe('assignmentAfter', () => {
  const inGroup = { kind: 'text', groupId: 'dana', forAnyone: false } as const;
  const anyone = { kind: 'text', groupId: null, forAnyone: true } as const;
  /** Who fills `field` in, without its kind. */
  const whose = ({ groupId, forAnyone }: { groupId: string | null; forAnyone: boolean }) => ({
    groupId,
    forAnyone,
  });

  test('setting a group or the mark replaces the other', () => {
    expect(assignmentAfter({ forAnyone: true }, inGroup)).toEqual({
      groupId: null,
      forAnyone: true,
    });
    expect(assignmentAfter({ groupId: 'ada' }, anyone)).toEqual({
      groupId: 'ada',
      forAnyone: false,
    });
  });

  test('null and false take away only their own, and naming neither changes nothing', () => {
    expect(assignmentAfter({ groupId: null }, anyone)).toEqual(whose(anyone));
    expect(assignmentAfter({ forAnyone: false }, inGroup)).toEqual(whose(inGroup));
    expect(assignmentAfter({ groupId: null }, inGroup)).toEqual({
      groupId: null,
      forAnyone: false,
    });
    expect(assignmentAfter({ forAnyone: false }, anyone)).toEqual({
      groupId: null,
      forAnyone: false,
    });
    expect(assignmentAfter({}, anyone)).toEqual(whose(anyone));
    expect(assignmentAfter({ groupId: null, forAnyone: true }, inGroup)).toEqual(whose(anyone));
    expect(assignmentAfter({ groupId: 'ada', forAnyone: false }, anyone)).toEqual({
      groupId: 'ada',
      forAnyone: false,
    });
  });

  test('refuses a group with the mark, and the mark on a signature field', () => {
    for (const [patch, field] of [
      [{ groupId: 'ada', forAnyone: true }, anyone],
      [{ groupId: 'dana', forAnyone: true }, inGroup],
      [{ forAnyone: true }, { kind: 'signature', groupId: 'dana', forAnyone: false }],
      [{ forAnyone: 'yes' as unknown as boolean }, inGroup],
    ] as const) {
      const error = refusal(() => assignmentAfter(patch, field));
      expect(EngineError.is(error) && error.code).toBe(EngineErrorCode.InvalidArg);
      expect((error as EngineError).details).toMatchObject({ field: 'forAnyone' });
    }
  });
});

describe('withForAnyone', () => {
  test('gives an older field forAnyone: false and leaves a whole one as it is', () => {
    expect(withForAnyone({ name: 'a' })).toEqual({ name: 'a', forAnyone: false });
    const whole = { name: 'a', forAnyone: true };
    expect(withForAnyone(whole)).toBe(whole);
  });
});
