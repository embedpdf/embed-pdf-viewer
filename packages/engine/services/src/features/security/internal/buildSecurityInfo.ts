import type { DocumentSecurityProbeInfo } from '@embedpdf/engine-core/runtime';

import { hasAllStandardSecurityPermissions } from '../../../shared/securityPermissions';

export type OpenedAs = 'none' | 'user' | 'owner';

/**
 * Single constructor for the "successfully inspected" shape of
 * `DocumentSecurityProbeInfo`. Every path that actually resolves a
 * permission word — the cold file probe, the live-session snapshot, and
 * the password-permission check — funnels through here so the encrypted/
 * none distinction, the revision-nulling rule, and the
 * `pdfPermissionsAllAllowed` derivation stay defined in exactly one place.
 *
 * The password-blocked / unsupported / unknown shapes are NOT built here:
 * those carry null permission words and only the cold probe can produce
 * them, so they stay local to `SecurityReader.probeFile`.
 */
export function buildSecurityInfo(input: {
  openedAs: OpenedAs;
  permissionsBits: number;
  securityHandlerRevision: number | null;
  probedAt: number;
}): DocumentSecurityProbeInfo {
  const encrypted = input.openedAs !== 'none';
  return {
    encryptionState: encrypted ? 'encrypted' : 'none',
    encryptionRequiresPassword: false,
    securityHandlerRevision: encrypted ? input.securityHandlerRevision : null,
    pdfPermissionsBits: input.permissionsBits,
    pdfPermissionsAllAllowed: hasAllStandardSecurityPermissions(input.permissionsBits),
    pdfOpenedAs: input.openedAs,
    securityProbedAt: input.probedAt,
  };
}

/**
 * Mirrors `EPDF_PASSWORD_PERMISSION_*` in public/fpdfview.h:
 * invalid=0, none=1, user=2, owner=3.
 */
export function openedAsFromCode(code: number): OpenedAs {
  if (code === 3) return 'owner';
  if (code === 2) return 'user';
  return 'none';
}
