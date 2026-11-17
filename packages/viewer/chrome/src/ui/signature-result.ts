/**
 * What a sealing says about the verification information the signature
 * settings ask for, for the two places that seal: the sign dialog and the
 * signatures panel.
 */
import type { SignatureCapability, SignFieldResult } from '@embedpdf/react/signature';

/**
 * Whether a sealing left out the verification information the settings ask
 * for. Either adding it failed, or the session may not add it (that takes
 * `doc.sign`, which the right to sign a group's fields doesn't give): the
 * result then reports nothing added and nothing failed.
 */
export function lacksValidationInfo(
  signature: Pick<SignatureCapability, 'getSettings'>,
  result: Pick<SignFieldResult, 'validationInfo' | 'validationInfoError'>,
): boolean {
  if (result.validationInfoError !== null) return true;
  return signature.getSettings().revocation !== null && result.validationInfo === null;
}

/** Why it was left out, for the console: the failure, or that the session may not add it. */
export function validationInfoReason(
  result: Pick<SignFieldResult, 'validationInfoError'>,
): unknown {
  return result.validationInfoError ?? 'this session may not add it (it takes doc.sign)';
}
