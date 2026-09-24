import { describe, expect, test } from 'vitest';

import {
  deriveProtection,
  protectedCapabilities,
  APPROVAL_BASELINE,
  SIGNATURE_POLICY_VERSION,
} from '../src/signature/protection';
import type { SignatureDTO } from '../src/signature/types';

const sig = (over: Partial<SignatureDTO>): SignatureDTO => ({
  index: 0,
  field: { kind: 'objectNumber', fieldObjectNumber: 10 },
  fieldName: 'sig',
  widget: null,
  signed: true,
  kind: 'signature',
  filter: 'Adobe.PPKLite',
  subFilter: 'ETSI.CAdES.detached',
  byteRange: [0, 10, 20, 5],
  contentsSize: 8,
  coverage: 'whole-revision',
  revisionIndex: 1,
  signer: { name: null, reason: null, location: null, contactInfo: null, claimedTime: null },
  docMdp: null,
  catalogCertification: false,
  fieldMdp: null,
  lock: null,
  seedValue: null,
  ...over,
});

/**
 * Two answers, not one: what a signer declared (enforced) and what a
 * validator judges later changes against. An approval signature declares
 * nothing and is judged at the baseline; a declaration governs both.
 */
describe('deriveProtection: enforced vs judged', () => {
  test('nothing signed: nothing enforced, nothing judged', () => {
    const p = deriveProtection([sig({ signed: false })]);
    expect(p).toMatchObject({ enforced: null, judged: null, certification: null, fieldLocks: [] });
    expect(p.policyVersion).toBe(SIGNATURE_POLICY_VERSION);
    expect(protectedCapabilities(p).size).toBe(0);
  });

  test('an approval signature declares nothing and is judged at the baseline', () => {
    const p = deriveProtection([sig({})]);
    expect(p.enforced).toBeNull();
    expect(p.judged).toBe(APPROVAL_BASELINE);
    expect(APPROVAL_BASELINE).toBe('annotate');
    // Only a rewrite is refused: it erases signatures instead of invalidating them.
    expect([...protectedCapabilities(p)]).toEqual(['doc.download.flattened']);
  });

  test('a certification governs both answers, looser or stricter than the baseline', () => {
    const p3 = deriveProtection([sig({ catalogCertification: true, docMdp: 3 })]);
    expect(p3).toMatchObject({ enforced: 'annotate', judged: 'annotate' });
    expect(protectedCapabilities(p3).has('doc.annotate.modify')).toBe(false);
    expect(protectedCapabilities(p3).has('doc.annotate.import')).toBe(false);
    // A declaration refuses everything outside what it permits: structure too.
    expect(protectedCapabilities(p3).has('doc.pages.assemble')).toBe(true);
    expect(protectedCapabilities(p3).has('doc.forms.modify')).toBe(true);
    const p2 = deriveProtection([sig({ catalogCertification: true, docMdp: 2 })]);
    expect(p2).toMatchObject({ enforced: 'fill', judged: 'fill' });
    expect(protectedCapabilities(p2).has('doc.annotate.modify')).toBe(true);
    // Restoring someone else's annotations is still writing annotations.
    expect(protectedCapabilities(p2).has('doc.annotate.import')).toBe(true);
    expect(protectedCapabilities(p2).has('doc.forms.fill')).toBe(false);
    const p1 = deriveProtection([sig({ catalogCertification: true, docMdp: 1 })]);
    expect(p1).toMatchObject({ enforced: 'lta', judged: 'lta' });
    expect(protectedCapabilities(p1).has('doc.forms.fill')).toBe(true);
  });

  test('a signed field lock with /P tightens; a later approval never loosens a certification', () => {
    const locked = deriveProtection([sig({ lock: { action: 'all', fields: [], permission: 1 } })]);
    expect(locked).toMatchObject({ enforced: 'lta', judged: 'lta' });
    expect(locked.fieldLocks).toHaveLength(1);
    const mixed = deriveProtection([
      sig({ index: 0, catalogCertification: true, docMdp: 3 }),
      sig({ index: 1, fieldName: 'sig2' }),
    ]);
    expect(mixed).toMatchObject({ enforced: 'annotate', judged: 'annotate' });
  });

  test("unsigned fields' locks describe a future signature and lock nothing", () => {
    const p = deriveProtection([sig({ signed: false, lock: { action: 'all', fields: [] } })]);
    expect(p.fieldLocks).toEqual([]);
    expect(p.judged).toBeNull();
  });
});
