/** Reads over the last snapshot and validation. Memoized per snapshot so
 *  the lists stay reference-stable for selectors. */
import type { SignatureVerdict } from '@embedpdf/core-signature';
import type { FormFieldRef, SignatureDTO, SignatureSnapshot } from '@embedpdf/engine-core/runtime';

import type { SignatureCapability, SignatureFieldAddress } from '../contract';
import type { SignatureServices } from '../services';
import { sameRef } from '../services/store';

const EMPTY_SIGNATURES: readonly SignatureDTO[] = [];
const EMPTY_FIELDS: readonly FormFieldRef[] = [];

export function createSignatureReads({
  store,
  authority,
  siblings,
}: Pick<SignatureServices, 'store' | 'authority' | 'siblings'>) {
  const { state } = store;
  const { form } = siblings;

  let listsFor: SignatureSnapshot | null = null;
  let signed: readonly SignatureDTO[] = EMPTY_SIGNATURES;
  let unsigned: readonly FormFieldRef[] = EMPTY_FIELDS;
  const lists = () => {
    const snapshot = state().snapshot;
    if (!snapshot) return { signed: EMPTY_SIGNATURES, unsigned: EMPTY_FIELDS };
    if (listsFor !== snapshot) {
      listsFor = snapshot;
      signed = snapshot.signatures.filter((s) => s.signed);
      unsigned = snapshot.signatures.filter((s) => !s.signed).map((s) => s.field);
    }
    return { signed, unsigned };
  };

  /** The widget object number an address names, or null for a field ref. */
  const widgetObjectOf = (field: SignatureFieldAddress): number | null => {
    if (!('kind' in field)) return field.annotObjectNumber;
    if (field.kind === 'objectNumber' && 'annotObjectNumber' in field)
      return field.annotObjectNumber;
    return null;
  };
  const isFieldRef = (field: SignatureFieldAddress): field is FormFieldRef =>
    'kind' in field && (field.kind === 'fqn' || 'fieldObjectNumber' in field);

  const getSignature = (field: SignatureFieldAddress): SignatureDTO | null => {
    const snapshot = state().snapshot;
    if (!snapshot) return null;
    const widgetObject = widgetObjectOf(field);
    if (widgetObject !== null) {
      const byWidget = snapshot.signatures.find(
        (s) => s.widget?.annotObjectNumber === widgetObject,
      );
      if (byWidget) return byWidget;
      const owner = form.getFieldForWidget({ annotObjectNumber: widgetObject });
      return owner ? getSignature(owner.ref) : null;
    }
    if (!isFieldRef(field)) return null;
    return (
      snapshot.signatures.find((s) =>
        field.kind === 'fqn' ? s.fieldName === field.name : sameRef(s.field, field),
      ) ?? null
    );
  };
  const getVerdict = (field: SignatureFieldAddress): SignatureVerdict | null => {
    const signature = getSignature(field);
    if (!signature) return null;
    return state().verdicts?.find((v) => v.signature.index === signature.index) ?? null;
  };

  return {
    getSignature,
    getVerdict,
    api: {
      getSnapshot: () => state().snapshot,
      getStatus: () => state().status,
      listSignatures: () => lists().signed,
      listUnsignedFields: () => lists().unsigned,
      getSignature,
      listVerdicts: () => state().verdicts,
      getVerdict,
      getProtection: () => state().snapshot?.protection ?? null,
      getPending: () => state().pending,
      isBusy: () => state().busy,
      getMode: authority.mode,
      getTarget: () => state().target,
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureReads = ReturnType<typeof createSignatureReads>;
