import { describe, expect, it } from 'vitest';
import { InvalidScope, parseScope, validateScopeArray } from '../../../src/auth/scope';

describe('parseScope — wildcards and virtuals', () => {
  it('parses "*" as wildcard', () => {
    expect(parseScope('*')).toEqual({ kind: 'wildcard' });
  });

  it('parses "pdf.permissions" as virtual', () => {
    expect(parseScope('pdf.permissions')).toEqual({
      kind: 'virtual',
      name: 'pdf.permissions',
    });
  });
});

describe('parseScope — capabilities', () => {
  const cases = [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.text.search',
    'doc.content.copy',
    'doc.download',
    'doc.download.flattened',
    'doc.print',
    'doc.print.high',
    'doc.pages.modify',
    'doc.pages.assemble',
    'doc.forms.fill',
    'doc.forms.modify',
    'doc.annotate.read',
    'doc.annotate.modify',
    'doc.metadata.modify',
    'doc.redact',
  ] as const;

  it.each(cases)('parses %s as capability', (cap) => {
    expect(parseScope(cap)).toEqual({ kind: 'capability', name: cap });
  });

  it('rejects single-segment capability shapes', () => {
    expect(() => parseScope('download')).toThrow(InvalidScope);
    expect(() => parseScope('download')).toThrow(/invalid capability name shape/);
  });

  it('rejects uppercase in capability names', () => {
    expect(() => parseScope('doc.Text.copy')).toThrow(InvalidScope);
  });

  it('rejects unknown but well-shaped capability names', () => {
    expect(() => parseScope('doc.future.thing')).toThrow(/unknown capability/);
  });
});

describe('parseScope — removed legacy scopes throw clearly', () => {
  it('rejects "doc.read"', () => {
    expect(() => parseScope('doc.read')).toThrow(InvalidScope);
    expect(() => parseScope('doc.read')).toThrow(/unknown capability: doc\.read/);
  });

  it('rejects "doc.edit-pages"', () => {
    // hyphen fails the shape regex first
    expect(() => parseScope('doc.edit-pages')).toThrow(InvalidScope);
  });

  it('rejects "doc.save"', () => {
    expect(() => parseScope('doc.save')).toThrow(/unknown capability: doc\.save/);
  });

  it('rejects "doc.annotate" (renamed to doc.annotate.modify)', () => {
    expect(() => parseScope('doc.annotate')).toThrow(/unknown capability: doc\.annotate/);
  });
});

describe('parseScope — collab scopes', () => {
  it('parses annotations:update:self', () => {
    expect(parseScope('annotations:update:self')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'update',
      filter: { kind: 'self' },
    });
  });

  it('parses annotations:*:all (action wildcard)', () => {
    expect(parseScope('annotations:*:all')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: '*',
      filter: { kind: 'all' },
    });
  });

  it('parses annotations:set-group:all', () => {
    expect(parseScope('annotations:set-group:all')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'set-group',
      filter: { kind: 'all' },
    });
  });

  it('parses annotations:set-group:group=engineering', () => {
    expect(parseScope('annotations:set-group:group=engineering')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'set-group',
      filter: { kind: 'group', groupId: 'engineering' },
    });
  });

  it('rejects annotations:set-group:self (meaningless for group assignment)', () => {
    expect(() => parseScope('annotations:set-group:self')).toThrow(InvalidScope);
    expect(() => parseScope('annotations:set-group:self')).toThrow(
      /set-group only supports :all or :group=<id>/,
    );
  });

  it('rejects annotations:set-group:createdBy=alice (meaningless for group assignment)', () => {
    expect(() => parseScope('annotations:set-group:createdBy=alice')).toThrow(
      /set-group only supports :all or :group=<id>/,
    );
  });

  it('parses createdBy filter with a simple value', () => {
    expect(parseScope('annotations:delete:createdBy=user-7')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'delete',
      filter: { kind: 'createdBy', userId: 'user-7' },
    });
  });

  it('parses group filter with a simple value', () => {
    expect(parseScope('annotations:update:group=4')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'update',
      filter: { kind: 'group', groupId: '4' },
    });
  });

  it('preserves colons in filter values (uses first-two-colons split rule)', () => {
    expect(parseScope('annotations:update:createdBy=urn:uuid:abc-123')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'update',
      filter: { kind: 'createdBy', userId: 'urn:uuid:abc-123' },
    });
  });

  it('preserves pipes in filter values', () => {
    expect(parseScope('annotations:update:createdBy=auth0|user-44')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'update',
      filter: { kind: 'createdBy', userId: 'auth0|user-44' },
    });
  });

  it('preserves equals signs in filter values', () => {
    expect(parseScope('annotations:update:createdBy=k=v')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'update',
      filter: { kind: 'createdBy', userId: 'k=v' },
    });
  });
});

describe('parseScope — collab error paths', () => {
  it('rejects single-colon collab', () => {
    expect(() => parseScope('annotations:all')).toThrow(/entity:action:filter/);
  });

  it('rejects unknown entity', () => {
    expect(() => parseScope('forms:update:self')).toThrow(/unknown collab entity: forms/);
  });

  it('rejects unknown action', () => {
    expect(() => parseScope('annotations:reply:all')).toThrow(/unknown collab action: reply/);
  });

  it('accepts annotations:create:filter collab (target built from caller identity)', () => {
    expect(parseScope('annotations:create:self')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'create',
      filter: { kind: 'self' },
    });
    expect(parseScope('annotations:create:all')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'create',
      filter: { kind: 'all' },
    });
    expect(parseScope('annotations:create:group=legal')).toEqual({
      kind: 'collab',
      entity: 'annotations',
      action: 'create',
      filter: { kind: 'group', groupId: 'legal' },
    });
  });

  it('accepts doc.forms.read as a capability', () => {
    expect(parseScope('doc.forms.read')).toEqual({
      kind: 'capability',
      name: 'doc.forms.read',
    });
  });

  it('rejects unknown filter', () => {
    expect(() => parseScope('annotations:update:everyone')).toThrow(/unknown filter: everyone/);
  });

  it('rejects empty createdBy value', () => {
    expect(() => parseScope('annotations:update:createdBy=')).toThrow(
      /createdBy= requires a value/,
    );
  });

  it('rejects empty group value', () => {
    expect(() => parseScope('annotations:update:group=')).toThrow(/group= requires a value/);
  });
});

describe('validateScopeArray', () => {
  it('passes for a valid mix of shapes', () => {
    expect(() =>
      validateScopeArray([
        '*',
        'pdf.permissions',
        'doc.open',
        'doc.render',
        'doc.forms.read',
        'annotations:create:self',
        'annotations:update:group=4',
        'annotations:delete:createdBy=urn:uuid:abc',
        'annotations:set-group:group=legal',
      ]),
    ).not.toThrow();
  });

  it('throws on the first invalid string', () => {
    expect(() =>
      validateScopeArray([
        'doc.open',
        'doc.read', // legacy → invalid
        'doc.render',
      ]),
    ).toThrow(/unknown capability: doc\.read/);
  });

  it('throws InvalidScope carrying the offending string', () => {
    try {
      validateScopeArray(['doc.open', 'doc.bogus']);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidScope);
      expect((err as InvalidScope).scope).toBe('doc.bogus');
    }
  });

  it('accepts an empty array (deny-by-default at resolution time)', () => {
    expect(() => validateScopeArray([])).not.toThrow();
  });
});
