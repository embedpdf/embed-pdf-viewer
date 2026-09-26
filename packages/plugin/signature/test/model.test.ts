import { describe, expect, it } from 'vitest';
import { reload } from '@embedpdf/core';
import type { SignatureVerdict } from '@embedpdf/core-signature';
import type {
  DocumentEvent,
  EventOrigin,
  SignatureDTO,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';

import {
  emptySignatureRecord,
  foldSignatureEvent,
  initialSignatureState,
  newlyInvalidated,
  setBusy,
  setTarget,
  setVerdicts,
  type SignatureRecord,
} from '../src/model';

const origin: EventOrigin = {
  kind: 'local',
  sessionId: 'session',
  sub: null,
  ts: 0,
  serverId: null,
};
const field = { kind: 'objectNumber', fieldObjectNumber: 9 } as const;
const unsigned = { index: 0, field, fieldName: 'sig', signed: false } as unknown as SignatureDTO;
const snapshot = {
  chainValid: true,
  revisions: [],
  signatures: [unsigned],
  protection: {
    enforced: null,
    judged: null,
    certification: null,
    fieldLocks: [],
    policyVersion: 4,
  },
} as unknown as SignatureSnapshot;
const loaded: SignatureRecord = { snapshot, pending: null };

const verdict = (index: number, summary: string, basis: string) =>
  ({
    signature: { index, field },
    summary,
    modifications: { basis },
  }) as unknown as SignatureVerdict;

describe('session transitions', () => {
  it('return the same state when nothing changes', () => {
    const state = initialSignatureState();
    expect(setBusy(state, false)).toBe(state);
    expect(setTarget(state, null)).toBe(state);
    expect(setVerdicts(state, null)).toBe(state);
    const targeted = setTarget(state, field);
    expect(targeted.target).toBe(field);
    // The same field by another ref object is no change.
    expect(setTarget(targeted, { kind: 'objectNumber', fieldObjectNumber: 9 })).toBe(targeted);
    expect(setBusy(state, true).busy).toBe(true);
  });

  it('newlyInvalidated names only working-copy verdicts that turned invalid', () => {
    const held = [verdict(0, 'valid', 'persisted'), verdict(1, 'invalid', 'working-copy')];
    const next = [verdict(0, 'invalid', 'working-copy'), verdict(1, 'invalid', 'working-copy')];
    expect(newlyInvalidated(held, next).map((item) => item.signature.index)).toEqual([0]);
    expect(newlyInvalidated(null, [verdict(0, 'invalid', 'persisted')])).toEqual([]);
  });
});

describe('foldSignatureEvent', () => {
  it('parks a signing on prepare and releases it on abort', () => {
    const parked = foldSignatureEvent(loaded, {
      type: 'signatures.prepared',
      signingId: 'one',
      field,
      origin,
    }) as SignatureRecord;
    expect(parked.pending).toEqual({ signingId: 'one', field });
    expect(parked.snapshot).toBe(snapshot);
    const released = foldSignatureEvent(parked, {
      type: 'signatures.cancelled',
      signingId: 'one',
      origin,
    });
    expect((released as SignatureRecord).pending).toBeNull();
    // Nothing parked: a cancel changes nothing.
    expect(
      foldSignatureEvent(loaded, { type: 'signatures.cancelled', signingId: 'one', origin }),
    ).toBe(loaded);
  });

  it('applies a completed signing: the sealed field, the protection, no parked signing', () => {
    const sealed = { ...unsigned, signed: true } as SignatureDTO;
    const protection = { ...snapshot.protection, judged: 'annotate' };
    const next = foldSignatureEvent({ snapshot, pending: { signingId: 'one', field } }, {
      type: 'signatures.completed',
      signingId: 'one',
      origin,
      status: 'completed',
      signature: sealed,
      protection,
    } as unknown as DocumentEvent) as SignatureRecord;
    expect(next.pending).toBeNull();
    expect(next.snapshot?.signatures).toEqual([sealed]);
    expect(next.snapshot?.protection).toEqual(protection);
  });

  it('reloads when the set of fields changes, and ignores other events', () => {
    const created = foldSignatureEvent(emptySignatureRecord(), {
      type: 'forms.created',
      origin,
    } as unknown as DocumentEvent);
    expect(created).toEqual(reload());
    expect(created).not.toEqual(reload({ pages: [] }));
    const edited = { type: 'annotations.created', origin } as unknown as DocumentEvent;
    expect(foldSignatureEvent(loaded, edited)).toBe(loaded);
  });
});
