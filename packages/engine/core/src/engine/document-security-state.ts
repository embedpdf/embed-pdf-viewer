import type {
  DocumentAccessReason,
  DocumentSecurityState,
  PdfPermissionInfo,
} from './DocumentSecurityService';
import { permissionFlagsOf } from '../auth/scope';
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
    flags: permissionFlagsOf(info.pdfPermissionsBits),
    allAllowed: info.pdfPermissionsAllAllowed,
    openedAs: info.pdfOpenedAs,
    securityHandlerRevision: info.securityHandlerRevision,
  };
}

export function securityStateFromProbe(
  info: DocumentSecurityProbeInfo,
  options: { accessEndpoint?: string; cdnRequired?: boolean } = {},
): DocumentSecurityState {
  const permission = permissionInfoFromProbe(info);
  const reasons: DocumentAccessReason[] = [];
  if (info.encryptionRequiresPassword === true && !permission) reasons.push('password');
  if (options.cdnRequired) reasons.push('cdn');
  if (info.encryptionState === 'unknown') reasons.push('permissions-unknown');

  return {
    encryption: {
      state: info.encryptionState,
      requiresPassword: info.encryptionRequiresPassword,
    },
    permissions: {
      known: permission?.known ?? false,
      flags: permission?.flags ?? null,
      allAllowed: permission?.allAllowed ?? null,
      openedAs: permission?.openedAs ?? null,
      securityHandlerRevision: permission?.securityHandlerRevision ?? null,
      canUpgradeToOwner: info.encryptionState === 'encrypted' && info.pdfOpenedAs !== 'owner',
    },
    access: {
      required: reasons.length > 0,
      reasons,
      ...(reasons.length > 0 && options.accessEndpoint ? { endpoint: options.accessEndpoint } : {}),
    },
  };
}
