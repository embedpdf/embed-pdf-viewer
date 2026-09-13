/** Signature capability protocol without the signing plugin wiring. */
export {
  INITIALS_MARK_NAME,
  markRoleOf,
  SIGNATURE_MARK_NAME,
  SIGNATURES_LIBRARY_KIND,
  SignatureToken,
} from './types';
export type {
  Mark,
  MarkRole,
  SignatureAction,
  SignatureCapability,
  SignatureChange,
  SignatureConfig,
  SignatureMode,
  SignaturePending,
  SignatureState,
  SignFieldInput,
} from './types';
export type {
  AnalyzeInput,
  ChangeAnalysis,
  DocMdpPermission,
  DocumentProtection,
  FieldLockSpec,
  FormFieldRef,
  SignatureCompleteResult,
  SignatureDTO,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
export type {
  SignatureVerdict,
  SignerPort,
  TrustPort,
  ValidationTime,
} from '@embedpdf/core-signature';
