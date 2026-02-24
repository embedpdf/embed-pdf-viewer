import { PdfPermissionFlag } from '@embedpdf/models';
import { useCoreState } from './use-core-state.svelte';
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
 * Hook that provides reactive access to a document's effective permission flags.
 * Applies layered resolution: per-document override → global override → PDF permission.
 *
 * @param getDocumentId Function that returns the document ID
 * @returns An object with reactive permission properties.
 */
export function useDocumentPermissions(getDocumentId: () => string): DocumentPermissions {
  const coreStateRef = useCoreState();

  const documentId = $derived(getDocumentId());
  const coreState = $derived(coreStateRef.current);

  const effectivePermissions = $derived(
    coreState ? getEffectivePermissions(coreState, documentId) : PdfPermissionFlag.AllowAll,
  );

  const pdfPermissions = $derived(
    coreState?.documents[documentId]?.document?.permissions ?? PdfPermissionFlag.AllowAll,
  );

  const hasPermission = (flag: PdfPermissionFlag) =>
    coreState ? getEffectivePermission(coreState, documentId, flag) : true;

  const hasAllPermissions = (...flags: PdfPermissionFlag[]) =>
    flags.every((flag) => (coreState ? getEffectivePermission(coreState, documentId, flag) : true));

  return {
    get permissions() {
      return effectivePermissions;
    },
    get pdfPermissions() {
      return pdfPermissions;
    },
    hasPermission,
    hasAllPermissions,
    get canPrint() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.Print)
        : true;
    },
    get canModifyContents() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.ModifyContents)
        : true;
    },
    get canCopyContents() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.CopyContents)
        : true;
    },
    get canModifyAnnotations() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.ModifyAnnotations)
        : true;
    },
    get canFillForms() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.FillForms)
        : true;
    },
    get canExtractForAccessibility() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.ExtractForAccessibility)
        : true;
    },
    get canAssembleDocument() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.AssembleDocument)
        : true;
    },
    get canPrintHighQuality() {
      return coreState
        ? getEffectivePermission(coreState, documentId, PdfPermissionFlag.PrintHighQuality)
        : true;
    },
  };
}
