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
import { hasSignedField, sameFieldRef, setTarget } from '../model';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';

export function createTarget(ctx: SignatureContext, { events }: Pick<SignatureServices, 'events'>) {
  const { inspectionRequested } = events;
  /** A field that was just signed or filled is no longer the target. */
  const clearIfTarget = (field: FormFieldRef): void => {
    const current = ctx.state.get().target;
    if (current && sameFieldRef(current, field)) ctx.state.update(setTarget, null);
  };
  return {
    clearIfTarget,
    api: {
      setTarget: (field) => ctx.state.update(setTarget, field),
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
  { snapshot }: Pick<SignatureReads, 'snapshot'>,
  { sign }: { sign(input: SignFieldInput): Promise<SignatureCompleteResult> },
  { fillField }: { fillField(field: FormFieldRef, mark: Mark): Promise<void> },
) {
  const { signRequested } = events;
  const { documentId } = store;
  const { mode } = authority;
  const { stamp, annotation } = siblings;

  const placeMark = async (
    mark: Mark,
    target: { field: FormFieldRef } | StampPlacement,
  ): Promise<PlaceMarkResult> => {
    if (!('field' in target)) {
      // Free placement: a stamp, as in Preview; one placement law, the stamp plugin's.
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
        if (config.allowCertify && !hasSignedField(snapshot())) {
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

  return { api: { placeMark: verb(placeMark) } satisfies Partial<SignatureCapability> };
}
