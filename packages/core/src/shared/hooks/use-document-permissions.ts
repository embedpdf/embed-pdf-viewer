import { useMemo } from '@framework';
import { PdfPermissionFlag } from '@embedpdf/models';
import { useCoreState } from './use-core-state';

export interface DocumentPermissions {
  /** Raw permission flags from the document */
  permissions: number;
  /** Check if a specific permission flag is allowed */
  hasPermission: (flag: PdfPermissionFlag) => boolean;
  /** Check if all specified flags are allowed */
  hasAllPermissions: (...flags: PdfPermissionFlag[]) => boolean;

  // Shorthand booleans for all permission flags:
  /** Can print (possibly degraded quality) */
  canPrint: boolean;
  /** Can modify document contents */
  canModifyContents: boolean;
  /** Can copy/extract text and graphics */
  canCopyContents: boolean;
  /** Can add/modify annotations and fill forms */
  canModifyAnnotations: boolean;
  /** Can fill in existing form fields */
  canFillForms: boolean;
  /** Can extract for accessibility */
  canExtractForAccessibility: boolean;
  /** Can assemble document (insert, rotate, delete pages) */
  canAssembleDocument: boolean;
  /** Can print high quality */
  canPrintHighQuality: boolean;
}

/**
 * Hook that provides reactive access to a document's permission flags.
 *
 * @param documentId The ID of the document to check permissions for.
 * @returns An object with the raw permissions, helper functions, and shorthand booleans.
 */
export function useDocumentPermissions(documentId: string): DocumentPermissions {
  const coreState = useCoreState();

  return useMemo(() => {
    const permissions =
      coreState?.documents[documentId]?.document?.permissions ?? PdfPermissionFlag.AllowAll;

    const hasPermission = (flag: PdfPermissionFlag) => (permissions & flag) !== 0;
    const hasAllPermissions = (...flags: PdfPermissionFlag[]) =>
      flags.every((flag) => (permissions & flag) !== 0);

    return {
      permissions,
      hasPermission,
      hasAllPermissions,
      // All permission flags as booleans
      canPrint: hasPermission(PdfPermissionFlag.Print),
      canModifyContents: hasPermission(PdfPermissionFlag.ModifyContents),
      canCopyContents: hasPermission(PdfPermissionFlag.CopyContents),
      canModifyAnnotations: hasPermission(PdfPermissionFlag.ModifyAnnotations),
      canFillForms: hasPermission(PdfPermissionFlag.FillForms),
      canExtractForAccessibility: hasPermission(PdfPermissionFlag.ExtractForAccessibility),
      canAssembleDocument: hasPermission(PdfPermissionFlag.AssembleDocument),
      canPrintHighQuality: hasPermission(PdfPermissionFlag.PrintHighQuality),
    };
  }, [coreState, documentId]);
}
