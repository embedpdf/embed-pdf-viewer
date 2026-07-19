/**
 * Scope vocabulary, parser, errors, and PDF bit decoder.
 *
 * This module is the authoritative grammar for EmbedPDF JWT scope
 * strings. Resolution (resolver.ts), builders (builders.ts), and the
 * resource descriptor table (../wire/resources.ts) all consume the
 * types and primitives defined here.
 */

export type {
  AnnotationActor,
  CollabAction,
  CollabEntity,
  CollabFilter,
  DocCapability,
  IdentityClaims,
  ParsedCapability,
  ParsedCollab,
  ParsedScope,
  ParsedVirtual,
  ParsedWildcard,
  PdfBits,
} from './types';

export { PDF_BITS, decodePdfBits } from './pdf-bits';

export { parseScope, validateScopeArray } from './parser';

export { InvalidScope, MissingIdentity, PermissionDenied } from './errors';

export type { CollabTarget } from './resolver';
export {
  checkAnyCapability,
  checkCapability,
  checkCollab,
  checkSetGroup,
  expandedCapabilities,
  expandRawScope,
  filterMatches,
} from './resolver';

export { caps, collab, materializePdfPermissions, pdfPermissions } from './builders';
