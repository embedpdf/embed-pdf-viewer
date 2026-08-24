import type {
  DocumentAccessReason,
  DocumentSecurityState,
  PdfPermissionAdvisory,
  PdfPermissionInfo,
} from './DocumentSecurityService';
import type { PdfBits } from '../auth/scope';
import type { DocumentSecurityProbeInfo } from '../wire/worker-protocol';

export interface DocumentHeadLike {
  encryption: {
    state: DocumentSecurityState['encryption']['state'];
    requiresPassword: boolean | null;
  };
  permissions: DocumentSecurityState['permissions'];
  access: DocumentSecurityState['access'];
}

export function securityStateFromHead(head: DocumentHeadLike): DocumentSecurityState {
  return {
    encryption: {
      state: head.encryption.state,
      requiresPassword: head.encryption.requiresPassword,
    },
    permissions: { ...head.permissions },
    access: {
      required: head.access.required,
      reasons: [...head.access.reasons],
      ...(head.access.endpoint ? { endpoint: head.access.endpoint } : {}),
    },
  };
}

export function permissionInfoFromProbe(info: DocumentSecurityProbeInfo): PdfPermissionInfo | null {
  if (info.pdfPermissionsBits === null) return null;
  return {
    known: true,
    bits: info.pdfPermissionsBits,
    allAllowed: info.pdfPermissionsAllAllowed,
    openedAs: info.pdfOpenedAs,
    securityHandlerRevision: info.securityHandlerRevision,
  };
}

/**
 * Same as {@link permissionInfoFromProbe} but additionally populates
 * `flags` (typed PdfBits view) and `advisory` (capability-shaped
 * booleans for UI badges). Used by routes that have a decoded `PdfBits`
 * in hand — notably `/access`, which always does.
 *
 * Returns `null` for the same reason as the base function — when the
 * PDF hasn't been probed yet so bits are unknown.
 */
export function permissionInfoWithAdvisory(
  info: DocumentSecurityProbeInfo,
  pdfBits: PdfBits,
): PdfPermissionInfo | null {
  const base = permissionInfoFromProbe(info);
  if (!base) return null;
  return {
    ...base,
    flags: pdfBits,
    advisory: advisoryFromPdfBits(pdfBits),
  };
}

/**
 * Translate a {@link PdfBits} view into the capability-shaped
 * {@link PdfPermissionAdvisory}. The rules here MUST mirror the bit
 * combinations the scope resolver uses for `pdf.permissions`
 * expansion — `doc.print.high` requires bit 12 AND bit 3, etc.
 */
export function advisoryFromPdfBits(b: PdfBits): PdfPermissionAdvisory {
  return {
    canPrint: b.bit3,
    canPrintHigh: b.bit12 && b.bit3,
    canCopy: b.bit5,
    canAnnotate: b.bit6,
    canFillForms: b.bit6 || b.bit9,
    canModifyForms: b.bit6 && b.bit4,
    canModifyPages: b.bit4,
    canAssemble: b.bit11,
  };
}

export function securityStateFromProbe(
  info: DocumentSecurityProbeInfo,
  opts: { accessEndpoint?: string; cdnRequired?: boolean } = {},
): DocumentSecurityState {
  const permission = permissionInfoFromProbe(info);
  const reasons: DocumentAccessReason[] = [];
  if (info.encryptionRequiresPassword === true && !permission) reasons.push('password');
  if (opts.cdnRequired) reasons.push('cdn');
  if (info.encryptionState === 'unknown') reasons.push('permissions-unknown');

  return {
    encryption: {
      state: info.encryptionState,
      requiresPassword: info.encryptionRequiresPassword,
    },
    permissions: {
      known: permission?.known ?? false,
      bits: permission?.bits ?? null,
      allAllowed: permission?.allAllowed ?? null,
      openedAs: permission?.openedAs ?? null,
      securityHandlerRevision: permission?.securityHandlerRevision ?? null,
      canUpgradeToOwner: info.encryptionState === 'encrypted' && info.pdfOpenedAs !== 'owner',
    },
    access: {
      required: reasons.length > 0,
      reasons,
      ...(reasons.length > 0 && opts.accessEndpoint ? { endpoint: opts.accessEndpoint } : {}),
    },
  };
}
