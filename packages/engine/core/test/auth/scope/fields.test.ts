import { describe, expect, it } from 'vitest';

import {
  allowsFieldWrite,
  allowsSomeFieldWrite,
  authorizeFieldGroup,
  authorizeFieldWrite,
  type ChangeAuthority,
} from '../../../src/auth/scope/authority';
import { collab } from '../../../src/auth/scope/builders';
import { InvalidScope, PermissionDenied } from '../../../src/auth/scope/errors';
import { decodePdfBits, PDF_BITS } from '../../../src/auth/scope/pdf-bits';
import { parseScope } from '../../../src/auth/scope/parser';
import {
  checkAnyFieldAction,
  checkCapability,
  checkFieldAction,
  checkSetGroup,
  expandRawScope,
} from '../../../src/auth/scope/resolver';

const NO_BITS = decodePdfBits(0);

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
    const bits = decodePdfBits(PDF_BITS.MODIFY | PDF_BITS.ANNOTATE_FILL);
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
      grants: { scope: buyer, pdfBits: NO_BITS },
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
      grants: { scope: ['doc.forms.modify'], pdfBits: NO_BITS },
      protection: null,
    };
    expect(() => authorizeFieldGroup(authority, 'legal')).not.toThrow();
    expect(() => authorizeFieldGroup(authority, 'buyer')).toThrow(PermissionDenied);
  });
});
