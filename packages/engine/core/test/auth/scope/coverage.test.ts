import { describe, expect, it } from 'vitest';
import { scopeNotCovered } from '../../../src/auth/scope';

/** What a read-only key holds inside documents. */
const READ = [
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.text.search',
  'doc.text.copy',
  'doc.annotate.read',
  'doc.forms.read',
];

/** Every capability, as a key with full access inside documents lists them. */
const EVERY_CAPABILITY = [
  ...READ,
  'doc.download',
  'doc.download.flattened',
  'doc.content.copy',
  'doc.print',
  'doc.print.high',
  'doc.annotate.modify',
  'doc.annotate.import',
  'doc.forms.fill',
  'doc.forms.submit',
  'doc.forms.modify',
  'doc.forms.import',
  'doc.forms.script',
  'doc.pages.assemble',
  'doc.pages.modify',
  'doc.metadata.modify',
  'doc.outline.modify',
  'doc.attachments.modify',
  'doc.redact',
  'doc.sign',
  'doc.sign.certify',
];

describe('scopeNotCovered: wildcard', () => {
  it('`*` covers everything, `*` included', () => {
    expect(scopeNotCovered(['*'], ['*'])).toEqual([]);
    expect(scopeNotCovered([...EVERY_CAPABILITY, 'annotations:*:all'], ['*'])).toEqual([]);
  });

  it('only `*` covers `*`', () => {
    expect(scopeNotCovered(['*'], EVERY_CAPABILITY)).toEqual(['*']);
  });
});

describe('scopeNotCovered: capabilities', () => {
  it('a read-only holder gives reading, and names what it lacks', () => {
    expect(scopeNotCovered(['doc.open', 'doc.render'], READ)).toEqual([]);
    expect(scopeNotCovered(['doc.open', 'doc.print', 'doc.redact'], READ)).toEqual([
      'doc.print',
      'doc.redact',
    ]);
  });

  it('a capability covers the ones it implies, not the other way round', () => {
    expect(scopeNotCovered(['doc.render.thumbnail'], ['doc.render'])).toEqual([]);
    expect(scopeNotCovered(['doc.render'], ['doc.render.thumbnail'])).toEqual(['doc.render']);
    expect(scopeNotCovered(['doc.forms.fill', 'doc.forms.read'], ['doc.forms.modify'])).toEqual([]);
  });
});

describe('scopeNotCovered: collab writes', () => {
  it('doc.annotate.modify covers every annotation filter but set-group', () => {
    const holder = ['doc.open', 'doc.annotate.modify'];
    expect(scopeNotCovered(['doc.open', 'annotations:*:self'], holder)).toEqual([]);
    expect(scopeNotCovered(['annotations:update:group=legal'], holder)).toEqual([]);
    expect(scopeNotCovered(['annotations:set-group:group=legal'], holder)).toEqual([
      'annotations:set-group:group=legal',
    ]);
  });

  it('a filter covers the same filter, and `:all` covers every filter', () => {
    const holder = ['doc.annotate.read', 'annotations:update:group=legal'];
    expect(scopeNotCovered(['annotations:update:group=legal'], holder)).toEqual([]);
    expect(scopeNotCovered(['annotations:update:group=sales'], holder)).toEqual([
      'annotations:update:group=sales',
    ]);
    expect(scopeNotCovered(['annotations:update:all'], holder)).toEqual(['annotations:update:all']);
    expect(scopeNotCovered(['annotations:delete:createdBy=u-7'], ['annotations:*:all'])).toEqual(
      [],
    );
  });

  it("the holder's narrowing counts: modify plus update:self updates only its own", () => {
    expect(
      scopeNotCovered(['doc.annotate.modify'], ['doc.annotate.modify', 'annotations:update:self']),
    ).toEqual(['annotations:update:all']);
  });

  it("`:self` is the holder's own records, except on create", () => {
    expect(scopeNotCovered(['annotations:update:self'], ['annotations:*:self'])).toEqual([
      'annotations:update:self',
    ]);
    expect(scopeNotCovered(['annotations:create:self'], ['annotations:*:self'])).toEqual([]);
  });

  it('form fields follow the same rules', () => {
    expect(scopeNotCovered(['fields:fill:group=buyer'], ['doc.forms.fill'])).toEqual([]);
    expect(
      scopeNotCovered(['doc.forms.fill'], ['doc.forms.read', 'fields:fill:group=buyer']),
    ).toEqual(['doc.forms.fill', 'fields:fill:all']);
    expect(scopeNotCovered(['fields:sign:all'], ['doc.forms.fill'])).toEqual(['fields:sign:all']);
  });
});

describe('scopeNotCovered: pdf.permissions', () => {
  it('covers itself, and is covered by every capability', () => {
    expect(scopeNotCovered(['pdf.permissions'], ['pdf.permissions'])).toEqual([]);
    expect(scopeNotCovered(['pdf.permissions'], EVERY_CAPABILITY)).toEqual([]);
  });

  it('is not covered by reading only: some files allow more', () => {
    expect(scopeNotCovered(['pdf.permissions'], READ)).toContain('doc.print');
  });

  it('covers no capability a file may forbid', () => {
    expect(scopeNotCovered(['doc.print'], ['pdf.permissions'])).toEqual(['doc.print']);
    expect(scopeNotCovered(['doc.open', 'doc.render'], ['pdf.permissions'])).toEqual([]);
  });

  it('a collab scope next to it reaches past what the file allows the holder', () => {
    expect(
      scopeNotCovered(['pdf.permissions', 'annotations:update:all'], ['pdf.permissions']),
    ).toEqual(['annotations:update:all']);
  });
});

describe('scopeNotCovered: plugin permissions', () => {
  it('a plugin permission is covered by itself', () => {
    expect(scopeNotCovered(['protected-display.view'], ['protected-display.view'])).toEqual([]);
    expect(scopeNotCovered(['protected-display.view'], READ)).toEqual(['protected-display.view']);
  });
});
