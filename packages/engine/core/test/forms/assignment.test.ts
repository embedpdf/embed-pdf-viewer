import { describe, expect, test } from 'vitest';

import {
  assignmentAfter,
  assignmentOfGroup,
  assignmentsEqual,
  draftAssignment,
  groupIdOfAssignment,
  withAssignment,
  type FieldAssignment,
} from '../../src/forms/assignment';
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

const ANYONE: FieldAssignment = { kind: 'anyone' };
const UNASSIGNED: FieldAssignment = { kind: 'unassigned' };
const group = (groupId: string): FieldAssignment => ({ kind: 'group', groupId });

describe('assignmentAfter', () => {
  const states = [group('dana'), ANYONE, UNASSIGNED];

  test('an assignment works from any assignment', () => {
    for (const assignment of states) {
      for (const from of states) {
        expect(assignmentAfter({ assignment }, { kind: 'text', assignment: from })).toEqual(
          assignment,
        );
      }
    }
  });

  test('the groupId shorthand works from any assignment: a group, or null for unassigned', () => {
    for (const from of states) {
      const field = { kind: 'text', assignment: from } as const;
      expect(assignmentAfter({ groupId: 'ada' }, field)).toEqual(group('ada'));
      expect(assignmentAfter({ groupId: null }, field)).toEqual(UNASSIGNED);
      // Naming neither leaves the field's own.
      expect(assignmentAfter({}, field)).toBe(from);
    }
  });

  test('refuses both members, a malformed assignment and anyone on a signature field', () => {
    const text = { kind: 'text', assignment: UNASSIGNED } as const;
    for (const [patch, field, member] of [
      [{ groupId: 'ada', assignment: ANYONE }, text, 'assignment'],
      [{ groupId: null, assignment: UNASSIGNED }, text, 'assignment'],
      [{ assignment: ANYONE }, { kind: 'signature', assignment: group('dana') }, 'assignment'],
      [{ assignment: { kind: 'everyone' } }, text, 'assignment'],
      [{ assignment: { kind: 'group' } }, text, 'assignment'],
      [{ assignment: { kind: 'group', groupId: '' } }, text, 'assignment'],
      [{ assignment: null }, text, 'assignment'],
      [{ groupId: '' }, text, 'groupId'],
      [{ groupId: 'g'.repeat(257) }, text, 'groupId'],
    ] as const) {
      const error = refusal(() =>
        assignmentAfter(patch as Parameters<typeof assignmentAfter>[0], field),
      );
      expect(EngineError.is(error) && error.code).toBe(EngineErrorCode.InvalidArg);
      expect((error as EngineError).details).toMatchObject({ field: member });
    }
    // Any other assignment of a signature field is fine.
    const signature = { kind: 'signature', assignment: UNASSIGNED } as const;
    expect(assignmentAfter({ assignment: group('dana') }, signature)).toEqual(group('dana'));
    expect(assignmentAfter({ groupId: null }, signature)).toEqual(UNASSIGNED);
  });
});

describe('draftAssignment', () => {
  test('what the draft names, else unassigned', () => {
    expect(draftAssignment({ kind: 'text' })).toEqual(UNASSIGNED);
    expect(draftAssignment({ kind: 'text', groupId: null })).toEqual(UNASSIGNED);
    expect(draftAssignment({ kind: 'text', groupId: 'dana' })).toEqual(group('dana'));
    expect(draftAssignment({ kind: 'pushbutton', assignment: ANYONE })).toEqual(ANYONE);
  });

  test('refuses both members and anyone on a signature field', () => {
    for (const draft of [
      { kind: 'text', groupId: 'dana', assignment: group('dana') },
      { kind: 'signature', assignment: ANYONE },
    ] as const) {
      const error = refusal(() => draftAssignment(draft));
      expect(EngineError.is(error) && error.code).toBe(EngineErrorCode.InvalidArg);
    }
  });
});

describe('the group shorthand', () => {
  test('reads and writes the group of an assignment', () => {
    expect(assignmentOfGroup('dana')).toEqual(group('dana'));
    expect(assignmentOfGroup(null)).toEqual(UNASSIGNED);
    expect(groupIdOfAssignment(group('dana'))).toBe('dana');
    expect(groupIdOfAssignment(ANYONE)).toBe(null);
    expect(groupIdOfAssignment(UNASSIGNED)).toBe(null);
  });

  test('tells assignments apart', () => {
    expect(assignmentsEqual(group('dana'), group('dana'))).toBe(true);
    expect(assignmentsEqual(group('dana'), group('ada'))).toBe(false);
    expect(assignmentsEqual(ANYONE, UNASSIGNED)).toBe(false);
    expect(assignmentsEqual(ANYONE, { kind: 'anyone' })).toBe(true);
  });
});

describe('withAssignment', () => {
  test("gives an older field its group's assignment and leaves a whole one as it is", () => {
    expect(withAssignment({ name: 'a', groupId: null })).toEqual({
      name: 'a',
      groupId: null,
      assignment: UNASSIGNED,
    });
    expect(withAssignment({ name: 'a', groupId: 'dana' })).toEqual({
      name: 'a',
      groupId: 'dana',
      assignment: group('dana'),
    });
    const whole = { name: 'a', groupId: null, assignment: ANYONE };
    expect(withAssignment(whole)).toBe(whole);
  });
});
