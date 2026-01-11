import { computed, toValue, type MaybeRefOrGetter, ComputedRef } from 'vue';
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
 * Composable that provides reactive access to a document's permission flags.
 *
 * @param documentId The ID of the document to check permissions for (can be ref, computed, getter, or plain value).
 * @returns A computed ref with the permission object.
 */
export function useDocumentPermissions(
  documentId: MaybeRefOrGetter<string>,
): ComputedRef<DocumentPermissions> {
  const coreState = useCoreState();

  return computed(() => {
    const docId = toValue(documentId);
    const permissions =
      coreState.value?.documents[docId]?.document?.permissions ?? PdfPermissionFlag.AllowAll;

    const hasPermission = (flag: PdfPermissionFlag) => (permissions & flag) !== 0;
    const hasAllPermissions = (...flags: PdfPermissionFlag[]) =>
      flags.every((flag) => (permissions & flag) !== 0);

    return {
      permissions,
      hasPermission,
      hasAllPermissions,
      canPrint: hasPermission(PdfPermissionFlag.Print),
      canModifyContents: hasPermission(PdfPermissionFlag.ModifyContents),
      canCopyContents: hasPermission(PdfPermissionFlag.CopyContents),
      canModifyAnnotations: hasPermission(PdfPermissionFlag.ModifyAnnotations),
      canFillForms: hasPermission(PdfPermissionFlag.FillForms),
      canExtractForAccessibility: hasPermission(PdfPermissionFlag.ExtractForAccessibility),
      canAssembleDocument: hasPermission(PdfPermissionFlag.AssembleDocument),
      canPrintHighQuality: hasPermission(PdfPermissionFlag.PrintHighQuality),
    };
  });
}
