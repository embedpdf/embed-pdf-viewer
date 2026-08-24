import { describe, expect, it } from 'vitest';
import {
  checkAnyCapability,
  checkCapability,
  checkCollab,
  checkSetGroup,
  expandRawScope,
  filterMatches,
  parseScope,
  PDF_BITS,
  decodePdfBits,
  type CollabFilter,
  type IdentityClaims,
  type PdfBits,
} from '../../../src/auth/scope';

// ============================================================================
// Test fixtures
// ============================================================================

const NO_BITS: PdfBits = decodePdfBits(null);
const ALL_BITS: PdfBits = decodePdfBits(
  PDF_BITS.PRINT |
    PDF_BITS.MODIFY |
    PDF_BITS.COPY |
    PDF_BITS.ANNOTATE_FILL |
    PDF_BITS.FILL_FORMS |
    PDF_BITS.ACCESSIBILITY |
    PDF_BITS.ASSEMBLE |
    PDF_BITS.PRINT_HIGH,
);

const ALICE: IdentityClaims = { user_id: 'alice', group_id: '4', groups: ['4', 'engineering'] };
const BOB: IdentityClaims = { user_id: 'bob', group_id: '5', groups: ['5'] };
const ANON: IdentityClaims = {};

// ============================================================================
// checkCapability — wildcard
// ============================================================================

describe('checkCapability — wildcard short-circuit', () => {
  it('grants any capability with "*" present', () => {
    expect(checkCapability('doc.download', ['*'], NO_BITS)).toBe(true);
    expect(checkCapability('doc.redact', ['*'], NO_BITS)).toBe(true);
    expect(checkCapability('doc.annotate.modify', ['*'], NO_BITS)).toBe(true);
  });

  it('grants any capability with "*" alongside others', () => {
    expect(checkCapability('doc.download', ['doc.text.copy', '*'], NO_BITS)).toBe(true);
  });
});

// ============================================================================
// checkCapability — explicit grants
// ============================================================================

describe('checkCapability — explicit grants', () => {
  it('grants capability listed verbatim', () => {
    expect(checkCapability('doc.download', ['doc.download'], NO_BITS)).toBe(true);
  });

  it('denies capability not listed', () => {
    expect(checkCapability('doc.download', ['doc.open'], NO_BITS)).toBe(false);
  });

  it('denies on empty scope (deny by default)', () => {
    expect(checkCapability('doc.open', [], ALL_BITS)).toBe(false);
    expect(checkCapability('doc.render', [], ALL_BITS)).toBe(false);
  });
});

// ============================================================================
// checkCapability — pdf.permissions expansion
// ============================================================================

describe('pdf.permissions expansion — always-on capabilities', () => {
  it('always grants doc.open even with no PDF bits set', () => {
    expect(checkCapability('doc.open', ['pdf.permissions'], NO_BITS)).toBe(true);
  });

  it('always grants doc.render even with no PDF bits set', () => {
    expect(checkCapability('doc.render', ['pdf.permissions'], NO_BITS)).toBe(true);
  });
});

describe('pdf.permissions expansion — bit-derived', () => {
  it('bit 5 grants text.select, text.copy, text.search, content.copy', () => {
    const bits = decodePdfBits(PDF_BITS.COPY);
    expect(checkCapability('doc.text.select', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.text.copy', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.text.search', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.content.copy', ['pdf.permissions'], bits)).toBe(true);
  });

  it('bit 5 absent denies all text capabilities', () => {
    expect(checkCapability('doc.text.select', ['pdf.permissions'], NO_BITS)).toBe(false);
    expect(checkCapability('doc.text.copy', ['pdf.permissions'], NO_BITS)).toBe(false);
    expect(checkCapability('doc.text.search', ['pdf.permissions'], NO_BITS)).toBe(false);
    expect(checkCapability('doc.content.copy', ['pdf.permissions'], NO_BITS)).toBe(false);
  });

  it('bit 3 grants doc.print', () => {
    const bits = decodePdfBits(PDF_BITS.PRINT);
    expect(checkCapability('doc.print', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.print.high', ['pdf.permissions'], bits)).toBe(false);
  });

  it('bit 12 grants doc.print.high ONLY when bit 3 is also set', () => {
    const onlyHigh = decodePdfBits(PDF_BITS.PRINT_HIGH);
    expect(checkCapability('doc.print.high', ['pdf.permissions'], onlyHigh)).toBe(false);

    const both = decodePdfBits(PDF_BITS.PRINT | PDF_BITS.PRINT_HIGH);
    expect(checkCapability('doc.print', ['pdf.permissions'], both)).toBe(true);
    expect(checkCapability('doc.print.high', ['pdf.permissions'], both)).toBe(true);
  });

  it('bit 4 grants doc.pages.modify, doc.redact, and doc.metadata.modify', () => {
    const bits = decodePdfBits(PDF_BITS.MODIFY);
    expect(checkCapability('doc.pages.modify', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.redact', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.metadata.modify', ['pdf.permissions'], bits)).toBe(true);
  });

  it('bit 11 grants doc.pages.assemble', () => {
    const bits = decodePdfBits(PDF_BITS.ASSEMBLE);
    expect(checkCapability('doc.pages.assemble', ['pdf.permissions'], bits)).toBe(true);
  });

  it('bit 6 grants doc.annotate.read AND doc.annotate.modify', () => {
    const bits = decodePdfBits(PDF_BITS.ANNOTATE_FILL);
    expect(checkCapability('doc.annotate.read', ['pdf.permissions'], bits)).toBe(true);
    expect(checkCapability('doc.annotate.modify', ['pdf.permissions'], bits)).toBe(true);
  });

  it('bit 6 OR bit 9 grants doc.forms.fill', () => {
    const onlyB6 = decodePdfBits(PDF_BITS.ANNOTATE_FILL);
    const onlyB9 = decodePdfBits(PDF_BITS.FILL_FORMS);
    expect(checkCapability('doc.forms.fill', ['pdf.permissions'], onlyB6)).toBe(true);
    expect(checkCapability('doc.forms.fill', ['pdf.permissions'], onlyB9)).toBe(true);
  });

  it('doc.forms.modify requires bit 6 AND bit 4 (strict PDF spec)', () => {
    const onlyB6 = decodePdfBits(PDF_BITS.ANNOTATE_FILL);
    const onlyB4 = decodePdfBits(PDF_BITS.MODIFY);
    const both = decodePdfBits(PDF_BITS.ANNOTATE_FILL | PDF_BITS.MODIFY);
    expect(checkCapability('doc.forms.modify', ['pdf.permissions'], onlyB6)).toBe(false);
    expect(checkCapability('doc.forms.modify', ['pdf.permissions'], onlyB4)).toBe(false);
    expect(checkCapability('doc.forms.modify', ['pdf.permissions'], both)).toBe(true);
  });

  it('does NOT grant cloud-only capabilities (download, etc.) regardless of bits', () => {
    expect(checkCapability('doc.download', ['pdf.permissions'], ALL_BITS)).toBe(false);
    expect(checkCapability('doc.download.flattened', ['pdf.permissions'], ALL_BITS)).toBe(false);
  });

  it('pdf.permissions never consults bits when not in scope', () => {
    // Token has explicit doc.download but no pdf.permissions; bits are
    // ALL set but text.copy is NOT granted because pdf.permissions wasn't
    // requested.
    expect(checkCapability('doc.text.copy', ['doc.download'], ALL_BITS)).toBe(false);
  });
});

// ============================================================================
// checkAnyCapability
// ============================================================================

describe('checkAnyCapability', () => {
  it('grants when ANY of the listed capabilities is granted', () => {
    expect(
      checkAnyCapability(['doc.text.copy', 'doc.text.search'], ['doc.text.search'], NO_BITS),
    ).toBe(true);
  });

  it('denies when NONE of the listed capabilities is granted', () => {
    expect(
      checkAnyCapability(['doc.text.copy', 'doc.text.search'], ['doc.download'], NO_BITS),
    ).toBe(false);
  });

  it('wildcard scope grants the disjunction trivially', () => {
    expect(checkAnyCapability(['doc.text.copy', 'doc.text.search'], ['*'], NO_BITS)).toBe(true);
  });
});

// ============================================================================
// Implications inside expandedCapabilities
// ============================================================================

describe('expandedCapabilities — implications', () => {
  it('doc.annotate.modify implies doc.annotate.read', () => {
    const set = expandRawScope(['doc.annotate.modify'], NO_BITS);
    expect(set.has('doc.annotate.modify')).toBe(true);
    expect(set.has('doc.annotate.read')).toBe(true);
  });

  it('any annotation collab scope (create/update/delete/set-group) implies doc.annotate.read', () => {
    const cases = [
      ['annotations:create:self'],
      ['annotations:update:group=4'],
      ['annotations:delete:createdBy=alice'],
      ['annotations:set-group:all'],
      ['annotations:*:all'],
    ];
    for (const scope of cases) {
      const set = expandRawScope(scope, NO_BITS);
      expect(set.has('doc.annotate.read')).toBe(true);
    }
  });

  it('doc.forms.modify implies doc.forms.fill and doc.forms.read', () => {
    const set = expandRawScope(['doc.forms.modify'], NO_BITS);
    expect(set.has('doc.forms.modify')).toBe(true);
    expect(set.has('doc.forms.fill')).toBe(true);
    expect(set.has('doc.forms.read')).toBe(true);
  });

  it('doc.forms.fill implies doc.forms.read', () => {
    const set = expandRawScope(['doc.forms.fill'], NO_BITS);
    expect(set.has('doc.forms.fill')).toBe(true);
    expect(set.has('doc.forms.read')).toBe(true);
  });

  it('pdf.permissions adds annotate.read and forms.read unconditionally', () => {
    const set = expandRawScope(['pdf.permissions'], NO_BITS);
    expect(set.has('doc.annotate.read')).toBe(true);
    expect(set.has('doc.forms.read')).toBe(true);
    // No bit 6, so no annotate.modify
    expect(set.has('doc.annotate.modify')).toBe(false);
  });

  it('pdf.permissions + bit 6 implies annotate.modify (read already unconditional)', () => {
    const bits = decodePdfBits(PDF_BITS.ANNOTATE_FILL);
    const set = expandRawScope(['pdf.permissions'], bits);
    expect(set.has('doc.annotate.read')).toBe(true);
    expect(set.has('doc.annotate.modify')).toBe(true);
  });

  it('no implication for empty scope', () => {
    expect(expandRawScope([], ALL_BITS).size).toBe(0);
  });
});

// ============================================================================
// checkCollab — narrowing model
//
// Rule for each action independently:
//   1. wildcard *                          → allow
//   2. any collab scope applies to action  → narrow: only collab decides
//   3. else if doc.annotate.modify present → allow (broad default)
//   4. else                                → deny
// ============================================================================

describe('checkCollab — narrowing model', () => {
  it('wildcard grants every collab action', () => {
    const target = { userId: 'bob', groupId: '5' };
    expect(checkCollab('create', target, ['*'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('update', target, ['*'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('delete', target, ['*'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('set-group', target, ['*'], ALICE, NO_BITS)).toBe(true);
  });

  it('doc.annotate.modify alone covers create/update/delete on any target', () => {
    const target = { userId: 'bob', groupId: '5' };
    expect(checkCollab('create', target, ['doc.annotate.modify'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('update', target, ['doc.annotate.modify'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('delete', target, ['doc.annotate.modify'], ANON, NO_BITS)).toBe(true);
  });

  it('pdf.permissions bit 6 → modify → covers any target (no collab present)', () => {
    const bits = decodePdfBits(PDF_BITS.ANNOTATE_FILL);
    const target = { userId: 'bob', groupId: '5' };
    expect(checkCollab('delete', target, ['pdf.permissions'], ALICE, bits)).toBe(true);
  });

  it('NARROWING: [modify, update:self] restricts update to own row', () => {
    const ownRow = { userId: 'alice', groupId: '4' };
    const othersRow = { userId: 'bob', groupId: '5' };
    const scope = ['doc.annotate.modify', 'annotations:update:self'];
    // update narrowed by :self
    expect(checkCollab('update', ownRow, scope, ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('update', othersRow, scope, ALICE, NO_BITS)).toBe(false);
    // delete still covered by modify (no delete-collab present)
    expect(checkCollab('delete', othersRow, scope, ALICE, NO_BITS)).toBe(true);
  });

  it('NARROWING: [modify, update:self, delete:self] restricts both', () => {
    const ownRow = { userId: 'alice', groupId: '4' };
    const othersRow = { userId: 'bob', groupId: '5' };
    const scope = ['doc.annotate.modify', 'annotations:update:self', 'annotations:delete:self'];
    expect(checkCollab('update', ownRow, scope, ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('update', othersRow, scope, ALICE, NO_BITS)).toBe(false);
    expect(checkCollab('delete', ownRow, scope, ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('delete', othersRow, scope, ALICE, NO_BITS)).toBe(false);
  });

  it('NARROWING: [modify, *:self] action-wildcard narrows every action', () => {
    const ownRow = { userId: 'alice' };
    const othersRow = { userId: 'bob' };
    const scope = ['doc.annotate.modify', 'annotations:*:self'];
    expect(checkCollab('update', ownRow, scope, ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('update', othersRow, scope, ALICE, NO_BITS)).toBe(false);
    expect(checkCollab('delete', ownRow, scope, ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('delete', othersRow, scope, ALICE, NO_BITS)).toBe(false);
  });

  it('NARROWING: collab without modify still works (each action evaluated independently)', () => {
    const ownRow = { userId: 'alice' };
    const scope = ['annotations:update:self'];
    expect(checkCollab('update', ownRow, scope, ALICE, NO_BITS)).toBe(true);
    // No modify and no delete-collab → deny
    expect(checkCollab('delete', ownRow, scope, ALICE, NO_BITS)).toBe(false);
  });

  it('CREATE: filter evaluated against caller-built target', () => {
    // POST handler builds target = { userId: jwt.user_id, groupId: jwt.group_id }
    const selfTarget = { userId: 'alice', groupId: '4' };
    // :self always passes (target.userId === caller.user_id)
    expect(checkCollab('create', selfTarget, ['annotations:create:self'], ALICE, NO_BITS)).toBe(
      true,
    );
    // :all always passes
    expect(checkCollab('create', selfTarget, ['annotations:create:all'], ALICE, NO_BITS)).toBe(
      true,
    );
    // :group=X passes only when caller's default group is X
    expect(checkCollab('create', selfTarget, ['annotations:create:group=4'], ALICE, NO_BITS)).toBe(
      true,
    );
    expect(
      checkCollab(
        'create',
        { userId: 'alice', groupId: '99' },
        ['annotations:create:group=4'],
        { ...ALICE, group_id: '99', groups: ['99'] },
        NO_BITS,
      ),
    ).toBe(false);
  });
});

// ============================================================================
// checkCollab — filter resolution
// ============================================================================

describe('checkCollab — action matching', () => {
  it('action-specific scope only matches its action', () => {
    const target = { userId: 'alice', groupId: '4' };
    expect(checkCollab('update', target, ['annotations:update:self'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('delete', target, ['annotations:update:self'], ALICE, NO_BITS)).toBe(false);
  });

  it('action wildcard `*` matches every collab action', () => {
    const target = { userId: 'alice', groupId: '4' };
    expect(checkCollab('update', target, ['annotations:*:self'], ALICE, NO_BITS)).toBe(true);
    expect(checkCollab('delete', target, ['annotations:*:self'], ALICE, NO_BITS)).toBe(true);
  });
});

describe('checkCollab — filter: self', () => {
  it('matches when target userId equals identity user_id', () => {
    const target = { userId: 'alice', groupId: '4' };
    expect(checkCollab('update', target, ['annotations:update:self'], ALICE, NO_BITS)).toBe(true);
  });

  it('denies when target userId differs from identity user_id', () => {
    const target = { userId: 'bob', groupId: '5' };
    expect(checkCollab('update', target, ['annotations:update:self'], ALICE, NO_BITS)).toBe(false);
  });

  it('denies when identity has no user_id', () => {
    const target = { userId: 'alice' };
    expect(checkCollab('update', target, ['annotations:update:self'], ANON, NO_BITS)).toBe(false);
  });

  it('denies when target has no userId', () => {
    const target = {};
    expect(checkCollab('update', target, ['annotations:update:self'], ALICE, NO_BITS)).toBe(false);
  });
});

describe('checkCollab — filter: createdBy=<X>', () => {
  it('matches when target userId equals the filter value', () => {
    const target = { userId: 'alice', groupId: '4' };
    expect(
      checkCollab('delete', target, ['annotations:delete:createdBy=alice'], BOB, NO_BITS),
    ).toBe(true);
  });

  it('denies when target userId is different', () => {
    const target = { userId: 'bob' };
    expect(
      checkCollab('delete', target, ['annotations:delete:createdBy=alice'], BOB, NO_BITS),
    ).toBe(false);
  });

  it('matches regardless of who is calling (filter is row-scoped not user-scoped)', () => {
    const target = { userId: 'alice' };
    expect(
      checkCollab('delete', target, ['annotations:delete:createdBy=alice'], ANON, NO_BITS),
    ).toBe(true);
  });
});

describe('checkCollab — filter: group=<X>', () => {
  it('matches when target groupId equals filter AND identity is in that group', () => {
    const target = { userId: 'bob', groupId: '4' };
    expect(checkCollab('update', target, ['annotations:update:group=4'], ALICE, NO_BITS)).toBe(
      true,
    );
  });

  it('denies when target is in the group but identity is NOT', () => {
    const target = { userId: 'alice', groupId: '4' };
    expect(checkCollab('update', target, ['annotations:update:group=4'], BOB, NO_BITS)).toBe(false);
  });

  it('denies when identity is in the group but target is NOT', () => {
    const target = { userId: 'bob', groupId: '5' };
    expect(checkCollab('update', target, ['annotations:update:group=4'], ALICE, NO_BITS)).toBe(
      false,
    );
  });

  it('denies when target has no groupId', () => {
    const target = { userId: 'bob' };
    expect(checkCollab('update', target, ['annotations:update:group=4'], ALICE, NO_BITS)).toBe(
      false,
    );
  });
});

describe('checkCollab — filter: all', () => {
  it('matches every target regardless of identity', () => {
    expect(checkCollab('update', { userId: 'x' }, ['annotations:update:all'], ANON, NO_BITS)).toBe(
      true,
    );
    expect(checkCollab('update', {}, ['annotations:update:all'], ANON, NO_BITS)).toBe(true);
  });
});

describe('checkCollab — disjunction across multiple scopes', () => {
  it('grants when ANY collab scope matches', () => {
    const target = { userId: 'bob', groupId: '4' };
    const scope = ['annotations:update:self', 'annotations:update:group=4'];
    // self doesn't match (target=bob, identity=alice), but group=4 does
    expect(checkCollab('update', target, scope, ALICE, NO_BITS)).toBe(true);
  });

  it('denies when no collab scope matches the action AND target', () => {
    const target = { userId: 'carol', groupId: '99' };
    const scope = ['annotations:update:self', 'annotations:update:group=4'];
    expect(checkCollab('update', target, scope, ALICE, NO_BITS)).toBe(false);
  });
});

// ============================================================================
// filterMatches — direct unit coverage of the predicate
// ============================================================================

describe('filterMatches', () => {
  const cases: Array<{
    name: string;
    filter: CollabFilter;
    target: { userId?: string; groupId?: string };
    id: IdentityClaims;
    expected: boolean;
  }> = [
    { name: 'all matches anything', filter: { kind: 'all' }, target: {}, id: ANON, expected: true },
    {
      name: 'self matches when both ids agree',
      filter: { kind: 'self' },
      target: { userId: 'alice' },
      id: ALICE,
      expected: true,
    },
    {
      name: 'self denies when target absent',
      filter: { kind: 'self' },
      target: {},
      id: ALICE,
      expected: false,
    },
    {
      name: 'createdBy matches case-sensitive',
      filter: { kind: 'createdBy', userId: 'alice' },
      target: { userId: 'alice' },
      id: BOB,
      expected: true,
    },
    {
      name: 'createdBy denies case-mismatch',
      filter: { kind: 'createdBy', userId: 'alice' },
      target: { userId: 'Alice' },
      id: BOB,
      expected: false,
    },
    {
      name: 'group requires both row membership and identity membership',
      filter: { kind: 'group', groupId: '4' },
      target: { groupId: '4' },
      id: ALICE,
      expected: true,
    },
  ];

  it.each(cases)('$name', ({ filter, target, id, expected }) => {
    expect(filterMatches(filter, target, id)).toBe(expected);
  });
});

// ============================================================================
// checkSetGroup
// ============================================================================

describe('checkSetGroup', () => {
  it('always allows when newGroupId equals caller default (no authority needed)', () => {
    expect(checkSetGroup('engineering', 'engineering', [], NO_BITS)).toBe(true);
    expect(checkSetGroup('engineering', 'engineering', ['doc.open'], NO_BITS)).toBe(true);
  });

  it('denies when newGroupId differs from default and no set-group scope', () => {
    expect(checkSetGroup('legal', 'engineering', ['annotations:update:self'], NO_BITS)).toBe(false);
  });

  it('wildcard scope grants any group assignment', () => {
    expect(checkSetGroup('legal', 'engineering', ['*'], NO_BITS)).toBe(true);
  });

  it('doc.annotate.modify alone does NOT grant cross-group set-group (decoupled)', () => {
    // Set-group is a cloud-only assignment authority — it does not inherit
    // from modify (which is row-access). To reassign across groups you need
    // an explicit set-group scope or the wildcard.
    expect(checkSetGroup('legal', 'engineering', ['doc.annotate.modify'], NO_BITS)).toBe(false);
  });

  it('pdf.permissions + bit 6 grants modify but NOT cross-group set-group', () => {
    const bits = decodePdfBits(PDF_BITS.ANNOTATE_FILL);
    expect(checkSetGroup('legal', 'engineering', ['pdf.permissions'], bits)).toBe(false);
  });

  it('modify combined with an explicit set-group scope works as expected', () => {
    expect(
      checkSetGroup(
        'legal',
        'engineering',
        ['doc.annotate.modify', 'annotations:set-group:group=legal'],
        NO_BITS,
      ),
    ).toBe(true);
    expect(
      checkSetGroup(
        'marketing',
        'engineering',
        ['doc.annotate.modify', 'annotations:set-group:group=legal'],
        NO_BITS,
      ),
    ).toBe(false);
  });

  it('set-group:all allows any group assignment regardless of membership', () => {
    expect(checkSetGroup('legal', 'engineering', ['annotations:set-group:all'], NO_BITS)).toBe(
      true,
    );
    expect(checkSetGroup('marketing', 'engineering', ['annotations:set-group:all'], NO_BITS)).toBe(
      true,
    );
  });

  it('set-group:group=X only allows that specific group', () => {
    const scope = ['annotations:set-group:group=legal'];
    expect(checkSetGroup('legal', 'engineering', scope, NO_BITS)).toBe(true);
    expect(checkSetGroup('marketing', 'engineering', scope, NO_BITS)).toBe(false);
  });

  it('multiple set-group:group=X grants stack additively', () => {
    const scope = [
      'annotations:set-group:group=needs-review',
      'annotations:set-group:group=under-review',
      'annotations:set-group:group=approved',
    ];
    expect(checkSetGroup('needs-review', 'workflow', scope, NO_BITS)).toBe(true);
    expect(checkSetGroup('approved', 'workflow', scope, NO_BITS)).toBe(true);
    expect(checkSetGroup('legal', 'workflow', scope, NO_BITS)).toBe(false);
  });

  it('annotations:*:all covers set-group via action wildcard', () => {
    expect(checkSetGroup('legal', 'engineering', ['annotations:*:all'], NO_BITS)).toBe(true);
  });

  it('annotations:*:group=X covers set-group for that group via action wildcard', () => {
    const scope = ['annotations:*:group=legal'];
    expect(checkSetGroup('legal', 'engineering', scope, NO_BITS)).toBe(true);
    expect(checkSetGroup('marketing', 'engineering', scope, NO_BITS)).toBe(false);
  });

  it('callerDefaultGroupId undefined → any change needs explicit set-group authority', () => {
    expect(checkSetGroup('legal', undefined, ['annotations:update:self'], NO_BITS)).toBe(false);
    expect(checkSetGroup('legal', undefined, ['annotations:set-group:group=legal'], NO_BITS)).toBe(
      true,
    );
  });
});

// ============================================================================
// Cross-cutting: parser+resolver
// ============================================================================

describe('parser + resolver integration', () => {
  it('every parsed scope kind contributes the right thing to expansion', () => {
    const parsed = ['*', 'pdf.permissions', 'doc.download', 'annotations:update:self'].map(
      parseScope,
    );
    // Just sanity-check we can map through without throwing
    expect(parsed).toHaveLength(4);
    expect(parsed[0].kind).toBe('wildcard');
    expect(parsed[1].kind).toBe('virtual');
    expect(parsed[2].kind).toBe('capability');
    expect(parsed[3].kind).toBe('collab');
  });
});
