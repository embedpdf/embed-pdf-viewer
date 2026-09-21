/**
 * The destination rule and the sign-here flow: a mark over a field is
 * signed, drawn, or handed to the chrome by mode; a free placement is a
 * stamp (one placement law, the stamp plugin's).
 */
import { PluginError } from '@embedpdf/core';
import type { FormFieldRef, SignatureCompleteResult } from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';

import type {
  Mark,
  PlaceMarkResult,
  SignatureCapability,
  SignatureConfig,
  SignFieldInput,
} from '../contract';
import type { SignatureContext, SignatureServices } from '../services';
import { sameRef } from '../services/store';

export function createTarget(
  ctx: SignatureContext,
  { events, store }: Pick<SignatureServices, 'events' | 'store'>,
) {
  const { targetChanged, inspectionRequested } = events;
  const { state } = store;
  const setTarget = (field: FormFieldRef | null): void => {
    const current = state().target;
    if (current === field || (current && field && sameRef(current, field))) return;
    ctx.dispatch({ type: 'TARGET', field });
    targetChanged.emit({ field });
  };
  /** A field that was just signed or filled is no longer the target. */
  const clearIfTarget = (field: FormFieldRef): void => {
    const current = state().target;
    if (current && sameRef(current, field)) setTarget(null);
  };
  return {
    clearIfTarget,
    api: {
      setTarget,
      requestInspection: (field) => inspectionRequested.emit({ field }),
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureTarget = ReturnType<typeof createTarget>;

export function createPlacement(
  {
    events,
    store,
    authority,
    siblings,
  }: Pick<SignatureServices, 'events' | 'store' | 'authority' | 'siblings'>,
  config: SignatureConfig,
  { sign }: { sign(input: SignFieldInput): Promise<SignatureCompleteResult> },
  { fillField }: { fillField(field: FormFieldRef, mark: Mark): Promise<void> },
) {
  const { signRequested } = events;
  const { state, documentId } = store;
  const { mode } = authority;
  const { stamp, annotation } = siblings;

  const placeMark = async (
    mark: Mark,
    target: { field: FormFieldRef } | StampPlacement,
  ): Promise<PlaceMarkResult> => {
    if (!('field' in target)) {
      // Free placement: a stamp, as in Preview — one placement law, the stamp plugin's.
      if ('assetId' in mark) {
        const library = stamp();
        if (!library) {
          throw new PluginError('unsupported', 'signature', 'no stamp plugin to place an asset');
        }
        const ref = await library.placeAsset(documentId(), mark.assetId, target);
        return { kind: 'placed', annotation: ref };
      }
      const ref = await annotation().placeStamp({ source: mark.source }, target);
      return { kind: 'placed', annotation: ref };
    }
    switch (mode()) {
      case 'sign':
        // The first signature is the one that can certify: when the config
        // allows a certification, let the chrome offer the choice (its sign
        // dialog) instead of sealing a plain approval on the spot.
        if (config.allowCertify && !state().snapshot?.signatures.some((s) => s.signed)) {
          signRequested.emit({ field: target.field, mark });
          return { kind: 'requested', field: target.field };
        }
        return {
          kind: 'signed',
          field: target.field,
          result: await sign({ field: target.field, mark }),
        };
      case 'visual':
        await fillField(target.field, mark);
        return { kind: 'filled', field: target.field };
      case 'ask':
        signRequested.emit({ field: target.field, mark });
        return { kind: 'requested', field: target.field };
    }
  };

  return { api: { placeMark } satisfies Partial<SignatureCapability> };
}
