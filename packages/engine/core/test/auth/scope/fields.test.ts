import { describe, expect, it } from 'vitest';

import {
  allowsFieldWrite,
  allowsSomeFieldWrite,
  authorizeForAnyone,
  authorizeFieldGroup,
  authorizeFieldWrite,
  type ChangeAuthority,
} from '../../../src/auth/scope/authority';
import { collab } from '../../../src/auth/scope/builders';
import { InvalidScope, PermissionDenied } from '../../../src/auth/scope/errors';
import { permissionFlagsOf, PDF_BITS } from '../../../src/auth/scope/permission-flags';
import { parseScope } from '../../../src/auth/scope/parser';
import {
  checkAnyFieldAction,
  checkCapability,
  checkFieldAction,
  checkSetEveryGroup,
  checkSetGroup,
  expandRawScope,
  fieldRightsOf,
} from '../../../src/auth/scope/resolver';

const NO_BITS = permissionFlagsOf(0);

describe('fields: scopes', () => {
  it('parse with fill, sign, set-group and *, by all or group', () => {
    for (const action of ['fill', 'sign', 'set-group', '*']) {
      expect(parseScope(`fields:${action}:all`)).toEqual({
        kind: 'collab',
        entity: 'fields',
        action,
        filter: { kind: 'all' },
      });
      expect(parseScope(`fields:${action}:group=buyer`)).toEqual({
        kind: 'collab',
        entity: 'fields',
        action,
        filter: { kind: 'group', groupId: 'buyer' },
      });
    }
  });

  it('refuse filters about who made a field, and actions fields have not', () => {
    for (const raw of [
      'fields:fill:self',
      'fields:sign:createdBy=alice',
      'fields:create:all',
      'fields:update:group=buyer',
      'fields:fill:group=',
    ]) {
      expect(() => parseScope(raw)).toThrow(InvalidScope);
    }
  });

  it('build from collab.fields', () => {
    expect(collab.fields.fill.group('buyer')).toBe('fields:fill:group=buyer');
    expect(collab.fields.sign.all()).toBe('fields:sign:all');
    expect(collab.fields.setGroup.group('seller')).toBe('fields:set-group:group=seller');
    expect(collab.fields.all.group('seller')).toBe('fields:*:group=seller');
  });

  it('let the holder see the form: groups limit writes, never reads', () => {
    const granted = expandRawScope(['fields:fill:group=buyer'], NO_BITS);
    expect(granted.has('doc.forms.read')).toBe(true);
    expect(granted.has('doc.forms.fill')).toBe(false);
  });
});

describe('filling and signing a field', () => {
  const buyer = ['doc.open', 'fields:fill:group=buyer', 'fields:sign:group=buyer'];

  it('a group scope reaches its group only', () => {
    expect(checkFieldAction('fill', 'buyer', buyer, NO_BITS)).toBe(true);
    expect(checkFieldAction('sign', 'buyer', buyer, NO_BITS)).toBe(true);
    expect(checkFieldAction('fill', 'seller', buyer, NO_BITS)).toBe(false);
    // A field in no group is filled only by an unrestricted filler.
    expect(checkFieldAction('fill', null, buyer, NO_BITS)).toBe(false);
  });

  it('narrows per action: a fill scope says nothing about signing', () => {
    const scope = ['doc.forms.fill', 'doc.sign', 'fields:fill:group=buyer'];
    expect(checkFieldAction('fill', 'seller', scope, NO_BITS)).toBe(false);
    expect(checkFieldAction('sign', 'seller', scope, NO_BITS)).toBe(true);
  });

  it('without a fields scope, the broad capability decides for every field', () => {
    expect(checkFieldAction('fill', 'seller', ['doc.forms.fill'], NO_BITS)).toBe(true);
    expect(checkFieldAction('fill', null, ['doc.forms.fill'], NO_BITS)).toBe(true);
    expect(checkFieldAction('sign', 'seller', ['doc.forms.fill'], NO_BITS)).toBe(false);
    expect(checkFieldAction('fill', 'seller', ['*'], NO_BITS)).toBe(true);
  });

  it('pdf.permissions stays what the file allows: design is never narrowed', () => {
    const bits = permissionFlagsOf(PDF_BITS.MODIFY | PDF_BITS.ANNOTATE_FILL);
    const scope = ['pdf.permissions', 'fields:*:group=buyer'];
    expect(checkFieldAction('fill', 'buyer', scope, bits)).toBe(true);
    expect(checkFieldAction('fill', 'seller', scope, bits)).toBe(false);
    expect(checkCapability('doc.forms.modify', scope, bits)).toBe(true);
  });

  it('some field: a fields scope or the broad capability', () => {
    expect(checkAnyFieldAction('fill', buyer, NO_BITS)).toBe(true);
    expect(checkAnyFieldAction('fill', ['doc.forms.fill'], NO_BITS)).toBe(true);
    expect(checkAnyFieldAction('fill', ['doc.open'], NO_BITS)).toBe(false);
    expect(checkAnyFieldAction('sign', ['fields:fill:group=buyer'], NO_BITS)).toBe(false);
  });

  it('the authority names the scope a refused field would take', () => {
    const authority: ChangeAuthority = {
      identity: {},
      grants: { scope: buyer, permissionFlags: NO_BITS },
      protection: null,
    };
    expect(allowsFieldWrite(authority, 'buyer', 'fill')).toBe(true);
    expect(allowsSomeFieldWrite(authority, 'sign')).toBe(true);
    const refusal = (() => {
      try {
        authorizeFieldWrite(authority, 'seller', 'fill');
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(refusal).toBeInstanceOf(PermissionDenied);
    expect((refusal as PermissionDenied).required).toBe('fields:fill:group=seller');
    // A tenant (no grants) fills anything.
    expect(allowsFieldWrite({ ...authority, grants: null }, 'seller', 'fill')).toBe(true);
  });
});

describe('putting a field in a group', () => {
  it('your own default group always; another with fields:set-group for it', () => {
    expect(checkSetGroup('fields', 'legal', 'legal', [])).toBe(true);
    expect(checkSetGroup('fields', 'buyer', 'legal', ['fields:set-group:group=buyer'])).toBe(true);
    expect(checkSetGroup('fields', 'seller', 'legal', ['fields:set-group:group=buyer'])).toBe(
      false,
    );
    // Each entity's set-group is its own.
    expect(checkSetGroup('fields', 'buyer', 'legal', ['annotations:set-group:all'])).toBe(false);
    expect(checkSetGroup('annotations', 'buyer', 'legal', ['fields:set-group:all'])).toBe(false);
  });

  it('the authority refuses another group without the scope', () => {
    const authority: ChangeAuthority = {
      identity: { groupId: 'legal' },
      grants: { scope: ['doc.forms.modify'], permissionFlags: NO_BITS },
      protection: null,
    };
    expect(() => authorizeFieldGroup(authority, 'legal')).not.toThrow();
    expect(() => authorizeFieldGroup(authority, 'buyer')).toThrow(PermissionDenied);
  });

  it('no group takes no right of its own', () => {
    const grants = (scope: string[]) => ({ scope, permissionFlags: NO_BITS });
    const authority: ChangeAuthority = {
      identity: { groupId: 'legal' },
      grants: grants(['doc.forms.modify']),
      protection: null,
    };
    expect(() => authorizeFieldGroup(authority, null)).not.toThrow();
    // Rights for named groups don't come into it, and neither does the caller's own group.
    const named = grants(['doc.forms.modify', 'fields:set-group:group=buyer']);
    expect(() => authorizeFieldGroup({ ...authority, grants: named }, null)).not.toThrow();
    expect(() => authorizeFieldGroup({ ...authority, identity: {} }, null)).not.toThrow();
  });
});

describe('a field anyone fills in', () => {
  const forAnyone = { groupId: null, forAnyone: true };
  const grants = (scope: string[]) => ({ scope, permissionFlags: NO_BITS });

  it('is filled in by every scope that fills in some field, whatever group it names', () => {
    for (const scope of [
      ['doc.forms.fill'],
      ['fields:fill:all'],
      ['fields:fill:group=dana'],
      ['fields:*:group=ada'],
      ['doc.forms.fill', 'fields:fill:group=dana'],
      ['*'],
    ]) {
      expect(checkFieldAction('fill', forAnyone, scope, NO_BITS)).toBe(true);
    }
    // One that fills in no field, or only signs, fills in none.
    for (const scope of [['doc.open'], ['doc.forms.read'], ['fields:sign:group=dana'], []]) {
      expect(checkFieldAction('fill', forAnyone, scope, NO_BITS)).toBe(false);
    }
  });

  it('leaves a field of a group and the sender’s fields as they were', () => {
    const dana = ['fields:fill:group=dana'];
    expect(checkFieldAction('fill', { groupId: 'dana' }, dana, NO_BITS)).toBe(true);
    expect(checkFieldAction('fill', { groupId: 'ada' }, dana, NO_BITS)).toBe(false);
    expect(checkFieldAction('fill', { groupId: null }, dana, NO_BITS)).toBe(false);
    expect(checkFieldAction('fill', { groupId: null, forAnyone: false }, dana, NO_BITS)).toBe(
      false,
    );
    // A group id alone reads as a field of that group.
    expect(checkFieldAction('fill', 'dana', dana, NO_BITS)).toBe(true);
    expect(checkFieldAction('fill', null, dana, NO_BITS)).toBe(false);
  });

  it('follows what a signature took away', () => {
    const locked = {
      enforced: 'none',
      judged: 'none',
      certification: { signatureIndex: 0, permission: 1 },
      fieldLocks: [],
    } as unknown as Parameters<typeof checkFieldAction>[4];
    expect(checkFieldAction('fill', forAnyone, ['fields:fill:all'], NO_BITS, locked)).toBe(false);
  });

  it('is refused naming the broad capability', () => {
    const authority: ChangeAuthority = {
      identity: {},
      grants: grants(['doc.open']),
      protection: null,
    };
    expect(allowsFieldWrite(authority, forAnyone, 'fill')).toBe(false);
    expect(() => authorizeFieldWrite(authority, forAnyone, 'fill')).toThrow(PermissionDenied);
    try {
      authorizeFieldWrite(authority, forAnyone, 'fill');
    } catch (error) {
      expect((error as PermissionDenied).required).toBe('doc.forms.fill');
    }
    const dana = { ...authority, grants: grants(['fields:fill:group=dana']) };
    expect(allowsFieldWrite(dana, forAnyone, 'fill')).toBe(true);
    expect(() => authorizeFieldWrite(dana, forAnyone, 'fill')).not.toThrow();
    // A field read is an assignment.
    expect(allowsFieldWrite(dana, { groupId: 'ada', forAnyone: false }, 'fill')).toBe(false);
  });

  it('is marked with fields:set-group:all; unmarked with no right of its own', () => {
    expect(checkSetEveryGroup('fields', ['fields:set-group:all'])).toBe(true);
    expect(checkSetEveryGroup('fields', ['fields:*:all'])).toBe(true);
    expect(checkSetEveryGroup('fields', ['*'])).toBe(true);
    expect(checkSetEveryGroup('fields', ['fields:set-group:group=dana'])).toBe(false);
    expect(checkSetEveryGroup('fields', ['fields:fill:all', 'doc.forms.modify'])).toBe(false);
    expect(checkSetEveryGroup('fields', ['annotations:set-group:all'])).toBe(false);

    const designer: ChangeAuthority = {
      identity: { groupId: 'dana' },
      grants: grants(['doc.forms.modify', 'fields:set-group:group=dana']),
      protection: null,
    };
    expect(() => authorizeForAnyone(designer, false)).not.toThrow();
    expect(() => authorizeForAnyone(designer, true)).toThrow(PermissionDenied);
    try {
      authorizeForAnyone(designer, true);
    } catch (error) {
      expect((error as PermissionDenied).required).toBe('fields:set-group:all');
    }
    const sender = { ...designer, grants: grants(['doc.forms.modify', 'fields:set-group:all']) };
    expect(() => authorizeForAnyone(sender, true)).not.toThrow();
    expect(() => authorizeForAnyone({ ...designer, grants: null }, true)).not.toThrow();
    // The lists say the same: a designer may mark one where `setGroup` is every group.
    expect(fieldRightsOf(sender.grants!.scope, NO_BITS, null, undefined).setGroup).toEqual({
      all: true,
    });
  });
});
