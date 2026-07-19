import { u32 } from '../runtime/memory/bits';

/**
 * PDF Standard security handlers reserve bits 1-2 as 0, and PDFium masks
 * even owner permissions through that convention — so "all permissions"
 * for an encrypted document is `0xFFFFFFFC`, not `0xFFFFFFFF`.
 */
export const ALL_STANDARD_SECURITY_PERMISSIONS = 0xfffffffc;

/** Coerce PDFium's signed permission word to its unsigned 32-bit value. */
export const normalizeU32 = u32;

/** True when `bits` grants every standard security permission. */
export function hasAllStandardSecurityPermissions(bits: number): boolean {
  return (
    (u32(bits) & ALL_STANDARD_SECURITY_PERMISSIONS) >>> 0 === ALL_STANDARD_SECURITY_PERMISSIONS
  );
}
