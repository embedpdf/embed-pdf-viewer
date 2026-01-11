import { PdfPermissionFlag } from '@embedpdf/models';
import { useCoreState } from './use-core-state.svelte';

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
 * @param getDocumentId Function that returns the document ID
 * @returns An object with reactive permission properties.
 */
export function useDocumentPermissions(getDocumentId: () => string): DocumentPermissions {
  const coreStateRef = useCoreState();

  const documentId = $derived(getDocumentId());
  const permissions = $derived(
    coreStateRef.current?.documents[documentId]?.document?.permissions ??
      PdfPermissionFlag.AllowAll,
  );

  const hasPermission = (flag: PdfPermissionFlag) => (permissions & flag) !== 0;
  const hasAllPermissions = (...flags: PdfPermissionFlag[]) =>
    flags.every((flag) => (permissions & flag) !== 0);

  return {
    get permissions() {
      return permissions;
    },
    hasPermission,
    hasAllPermissions,
    get canPrint() {
      return (permissions & PdfPermissionFlag.Print) !== 0;
    },
    get canModifyContents() {
      return (permissions & PdfPermissionFlag.ModifyContents) !== 0;
    },
    get canCopyContents() {
      return (permissions & PdfPermissionFlag.CopyContents) !== 0;
    },
    get canModifyAnnotations() {
      return (permissions & PdfPermissionFlag.ModifyAnnotations) !== 0;
    },
    get canFillForms() {
      return (permissions & PdfPermissionFlag.FillForms) !== 0;
    },
    get canExtractForAccessibility() {
      return (permissions & PdfPermissionFlag.ExtractForAccessibility) !== 0;
    },
    get canAssembleDocument() {
      return (permissions & PdfPermissionFlag.AssembleDocument) !== 0;
    },
    get canPrintHighQuality() {
      return (permissions & PdfPermissionFlag.PrintHighQuality) !== 0;
    },
  };
}
