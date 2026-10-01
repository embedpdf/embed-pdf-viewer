/**
 * The destination rule and the sign-here flow: a mark over a field is
 * signed, drawn, or handed to the chrome by mode; a free placement is a
 * stamp (one placement law, the stamp plugin's).
 */
import { PluginError, type OperationOptions } from '@embedpdf/core';
import type { FormFieldRef, SignatureCompleteResult } from '@embedpdf/engine-core/runtime';
import type { StampPlacement } from '@embedpdf/plugin-annotation/contract';

import type { Mark, PlaceMarkResult, SignatureCapability, SignFieldInput } from '../contract';
import { hasSignedField, sameFieldRef, setTarget } from '../model';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';

export function createTarget(
  ctx: SignatureContext,
  { events }: Pick<SignatureServices, 'events'>,
  { getSignature }: Pick<SignatureReads, 'getSignature'>,
) {
  const { inspectionRequested } = events;
  /** One field, whether a ref names it by object number or by name. */
  const sameField = (left: FormFieldRef, right: FormFieldRef): boolean => {
    if (sameFieldRef(left, right)) return true;
    const signature = getSignature(left);
    return signature !== null && signature.index === getSignature(right)?.index;
  };
  /** A field that was just signed or filled is no longer the target. */
  const clearIfTarget = (field: FormFieldRef): void => {
    const current = ctx.state.get().target;
    if (current && sameField(current, field)) ctx.state.update(setTarget, null);
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
  ctx: SignatureContext,
  {
    events,
    store,
    authority,
    siblings,
  }: Pick<SignatureServices, 'events' | 'store' | 'authority' | 'siblings'>,
  { snapshot }: Pick<SignatureReads, 'snapshot'>,
  {
    sign,
  }: { sign(input: SignFieldInput, options?: OperationOptions): Promise<SignatureCompleteResult> },
  {
    fillField,
  }: { fillField(field: FormFieldRef, mark: Mark, options?: OperationOptions): Promise<void> },
) {
  const { signRequested } = events;
  const { documentId } = store;
  const { mode } = authority;
  const { stamp, annotation } = siblings;
  const settings = ctx.settings();

  const placeMark = async (
    mark: Mark,
    target: { field: FormFieldRef } | StampPlacement,
    options?: OperationOptions,
  ): Promise<PlaceMarkResult> => {
    if (!('field' in target)) {
      // Free placement: a stamp, as in Preview; one placement law, the stamp plugin's.
      if ('assetId' in mark) {
        const library = stamp();
        if (!library) {
          throw new PluginError('unsupported', 'signature', 'no stamp plugin to place an asset');
        }
        const placed = await library.placeAsset(mark.assetId, target, {
          documentId: documentId(),
          signal: options?.signal,
        });
        return { kind: 'placed', annotation: placed.annotation.ref };
      }
      const placed = await annotation().stamps.place({ source: mark.source }, target, options);
      return { kind: 'placed', annotation: placed.annotation.ref };
    }
    switch (mode()) {
      case 'sign':
        // The first signature is the one that can certify: when the settings
        // allow a certification, let the chrome offer the choice (its sign
        // dialog) instead of sealing a plain approval on the spot.
        if (settings.get().allowCertify && !hasSignedField(snapshot())) {
          signRequested.emit({ field: target.field, mark });
          return { kind: 'requested', field: target.field };
        }
        return {
          kind: 'signed',
          field: target.field,
          result: await sign({ field: target.field, mark }, options),
        };
      case 'visual':
        await fillField(target.field, mark, options);
        return { kind: 'filled', field: target.field };
      case 'ask':
        signRequested.emit({ field: target.field, mark });
        return { kind: 'requested', field: target.field };
    }
  };

  return { api: { placeMark: verb(placeMark) } satisfies Partial<SignatureCapability> };
}
