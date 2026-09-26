/** Reads over the signature facts and the last validation. The lists are
 *  memoized per snapshot so they stay reference-stable for selectors. */
import { memo, type Mirror } from '@embedpdf/core';
import type { SignatureVerdict } from '@embedpdf/core-signature';
import type { FormFieldRef, SignatureDTO } from '@embedpdf/engine-core/runtime';

import type { SignatureCapability, SignatureFieldAddress } from '../contract';
import { sameFieldRef, type SignatureRecord } from '../model';
import type { SignatureContext, SignatureServices } from '../services';

const EMPTY_SIGNATURES: readonly SignatureDTO[] = [];
const EMPTY_FIELDS: readonly FormFieldRef[] = [];

/** The widget object number an address names, or null for a field ref. */
const widgetObjectOf = (field: SignatureFieldAddress): number | null => {
  if (!('kind' in field)) return field.annotObjectNumber;
  if (field.kind === 'objectNumber' && 'annotObjectNumber' in field) {
    return field.annotObjectNumber;
  }
  return null;
};

const isFieldRef = (field: SignatureFieldAddress): field is FormFieldRef =>
  'kind' in field && (field.kind === 'fqn' || 'fieldObjectNumber' in field);

export function createSignatureReads(
  ctx: SignatureContext,
  { authority, siblings }: Pick<SignatureServices, 'authority' | 'siblings'>,
  signatures: Mirror<SignatureRecord>,
) {
  const { form } = siblings;
  const snapshot = () => signatures.get().snapshot;

  const lists = memo(
    () => [snapshot()],
    (current) =>
      current
        ? {
            signed: current.signatures.filter((signature) => signature.signed),
            unsigned: current.signatures
              .filter((signature) => !signature.signed)
              .map((signature) => signature.field),
          }
        : { signed: EMPTY_SIGNATURES, unsigned: EMPTY_FIELDS },
  );

  const getSignature = (field: SignatureFieldAddress): SignatureDTO | null => {
    const current = snapshot();
    if (!current) return null;
    const widgetObject = widgetObjectOf(field);
    if (widgetObject !== null) {
      const byWidget = current.signatures.find(
        (signature) => signature.widget?.annotObjectNumber === widgetObject,
      );
      if (byWidget) return byWidget;
      const owner = form.getFieldForWidget({ annotObjectNumber: widgetObject });
      return owner ? getSignature(owner.ref) : null;
    }
    if (!isFieldRef(field)) return null;
    return (
      current.signatures.find((signature) =>
        field.kind === 'fqn'
          ? signature.fieldName === field.name
          : sameFieldRef(signature.field, field),
      ) ?? null
    );
  };
  const getVerdict = (field: SignatureFieldAddress): SignatureVerdict | null => {
    const signature = getSignature(field);
    if (!signature) return null;
    return (
      ctx.state.get().verdicts?.find((verdict) => verdict.signature.index === signature.index) ??
      null
    );
  };

  return {
    snapshot,
    getSignature,
    getVerdict,
    api: {
      getSnapshot: snapshot,
      getStatus: signatures.getStatus,
      listSignatures: () => lists().signed,
      listUnsignedFields: () => lists().unsigned,
      getSignature,
      listVerdicts: () => ctx.state.get().verdicts,
      getVerdict,
      getProtection: () => snapshot()?.protection ?? null,
      getPending: () => signatures.get().pending,
      isBusy: () => ctx.state.get().busy,
      getMode: authority.mode,
      getTarget: () => ctx.state.get().target,
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureReads = ReturnType<typeof createSignatureReads>;
