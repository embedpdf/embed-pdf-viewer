import type {
  DocumentAccessReason,
  DocumentSecurityState,
  PdfPermissionAdvisory,
  PdfPermissionInfo,
} from './DocumentSecurityService';
import { materializePdfPermissions, type PdfBits } from '../auth/scope';
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
 * {@link PdfPermissionAdvisory}: what `pdf.permissions` grants on a file
 * with these bits.
 */
export function advisoryFromPdfBits(b: PdfBits): PdfPermissionAdvisory {
  const granted = new Set(materializePdfPermissions(b));
  return {
    canPrint: granted.has('doc.print'),
    canPrintHigh: granted.has('doc.print.high'),
    canCopy: granted.has('doc.text.copy'),
    canAnnotate: granted.has('doc.annotate.modify'),
    canFillForms: granted.has('doc.forms.fill'),
    canModifyForms: granted.has('doc.forms.modify'),
    canModifyPages: granted.has('doc.pages.modify'),
    canAssemble: granted.has('doc.pages.assemble'),
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
