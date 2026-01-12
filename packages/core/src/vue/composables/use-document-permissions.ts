import { computed, toValue, type MaybeRefOrGetter, ComputedRef } from 'vue';
import { PdfPermissionFlag } from '@embedpdf/models';
import { useCoreState } from './use-core-state';
import { getEffectivePermission, getEffectivePermissions } from '../../lib/store/selectors';

export interface DocumentPermissions {
  /** Effective permission flags after applying overrides */
  permissions: number;
  /** Raw PDF permission flags (before overrides) */
  pdfPermissions: number;
  /** Check if a specific permission flag is effectively allowed */
  hasPermission: (flag: PdfPermissionFlag) => boolean;
  /** Check if all specified flags are effectively allowed */
  hasAllPermissions: (...flags: PdfPermissionFlag[]) => boolean;

  // Shorthand booleans for all permission flags (using effective permissions):
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
 * Composable that provides reactive access to a document's effective permission flags.
 * Applies layered resolution: per-document override → global override → PDF permission.
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
    const state = coreState.value;

    if (!state) {
      return {
        permissions: PdfPermissionFlag.AllowAll,
        pdfPermissions: PdfPermissionFlag.AllowAll,
        hasPermission: () => true,
        hasAllPermissions: () => true,
        canPrint: true,
        canModifyContents: true,
        canCopyContents: true,
        canModifyAnnotations: true,
        canFillForms: true,
        canExtractForAccessibility: true,
        canAssembleDocument: true,
        canPrintHighQuality: true,
      };
    }

    const effectivePermissions = getEffectivePermissions(state, docId);
    const pdfPermissions =
      state.documents[docId]?.document?.permissions ?? PdfPermissionFlag.AllowAll;

    const hasPermission = (flag: PdfPermissionFlag) => getEffectivePermission(state, docId, flag);
    const hasAllPermissions = (...flags: PdfPermissionFlag[]) =>
      flags.every((flag) => getEffectivePermission(state, docId, flag));

    return {
      permissions: effectivePermissions,
      pdfPermissions,
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
