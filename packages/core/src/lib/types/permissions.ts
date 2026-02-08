import { PdfPermissionFlag } from '@embedpdf/models';

/**
 * Human-readable permission names for use in configuration.
 */
export type PermissionName =
  | 'print'
  | 'modifyContents'
  | 'copyContents'
  | 'modifyAnnotations'
  | 'fillForms'
  | 'extractForAccessibility'
  | 'assembleDocument'
  | 'printHighQuality';

/**
 * Map from human-readable names to PdfPermissionFlag values.
 */
export const PERMISSION_NAME_TO_FLAG: Record<PermissionName, PdfPermissionFlag> = {
  print: PdfPermissionFlag.Print,
  modifyContents: PdfPermissionFlag.ModifyContents,
  copyContents: PdfPermissionFlag.CopyContents,
  modifyAnnotations: PdfPermissionFlag.ModifyAnnotations,
  fillForms: PdfPermissionFlag.FillForms,
  extractForAccessibility: PdfPermissionFlag.ExtractForAccessibility,
  assembleDocument: PdfPermissionFlag.AssembleDocument,
  printHighQuality: PdfPermissionFlag.PrintHighQuality,
};

/**
 * Permission overrides can use either numeric flags or human-readable string names.
 */
export type PermissionOverrides = Partial<
  Record<PdfPermissionFlag, boolean> & Record<PermissionName, boolean>
>;

/**
 * Configuration for overriding document permissions.
 * Can be applied globally (at PluginRegistry level) or per-document (when opening).
 */
export interface PermissionConfig {
  /**
   * When true (default): use PDF's permissions as the base, then apply overrides.
   * When false: treat document as having all permissions allowed, then apply overrides.
   */
  enforceDocumentPermissions?: boolean;

  /**
   * Explicit per-flag overrides. Supports both numeric flags and string names.
   * - true = force allow (even if PDF denies)
   * - false = force deny (even if PDF allows)
   * - undefined = use base permissions
   *
   * @example
   * // Using string names (recommended)
   * overrides: { print: false, modifyAnnotations: true }
   *
   * @example
   * // Using numeric flags
   * overrides: { [PdfPermissionFlag.Print]: false }
   */
  overrides?: PermissionOverrides;
}

/**
 * All permission flags for iteration when computing effective permissions.
 */
export const ALL_PERMISSION_FLAGS: PdfPermissionFlag[] = [
  PdfPermissionFlag.Print,
  PdfPermissionFlag.ModifyContents,
  PdfPermissionFlag.CopyContents,
  PdfPermissionFlag.ModifyAnnotations,
  PdfPermissionFlag.FillForms,
  PdfPermissionFlag.ExtractForAccessibility,
  PdfPermissionFlag.AssembleDocument,
  PdfPermissionFlag.PrintHighQuality,
];

/**
 * All permission names for iteration.
 */
export const ALL_PERMISSION_NAMES: PermissionName[] = [
  'print',
  'modifyContents',
  'copyContents',
  'modifyAnnotations',
  'fillForms',
  'extractForAccessibility',
  'assembleDocument',
  'printHighQuality',
];

/**
 * Map from PdfPermissionFlag to human-readable name.
 */
export const PERMISSION_FLAG_TO_NAME: Record<PdfPermissionFlag, PermissionName> = {
  [PdfPermissionFlag.Print]: 'print',
  [PdfPermissionFlag.ModifyContents]: 'modifyContents',
  [PdfPermissionFlag.CopyContents]: 'copyContents',
  [PdfPermissionFlag.ModifyAnnotations]: 'modifyAnnotations',
  [PdfPermissionFlag.FillForms]: 'fillForms',
  [PdfPermissionFlag.ExtractForAccessibility]: 'extractForAccessibility',
  [PdfPermissionFlag.AssembleDocument]: 'assembleDocument',
  [PdfPermissionFlag.PrintHighQuality]: 'printHighQuality',
};

/**
 * Helper to get the override value for a permission flag, checking both numeric and string keys.
 */
export function getPermissionOverride(
  overrides: PermissionOverrides | undefined,
  flag: PdfPermissionFlag,
): boolean | undefined {
  if (!overrides) return undefined;

  // Check numeric key first
  if (flag in overrides) {
    return (overrides as Record<PdfPermissionFlag, boolean>)[flag];
  }

  // Check string key
  const name = PERMISSION_FLAG_TO_NAME[flag];
  if (name && name in overrides) {
    return (overrides as Record<PermissionName, boolean>)[name];
  }

  return undefined;
}
